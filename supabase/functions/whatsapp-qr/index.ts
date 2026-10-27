import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function instanceNameFor(clientId: string): string {
  return `wc_${clientId.replace(/-/g, '')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
  const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');

  if (!evolutionApiUrl || !evolutionApiKey || !webhookSecret) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp QR connect is not configured on this server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const anonClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = claimsData.claims.sub as string;

  try {
    const body = await req.json();
    const { action, clientId, numberId } = body;

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: canAccess } = await supabase.rpc('user_can_access_client', {
      _user_id: userId,
      _client_id: clientId,
    });
    if (!canAccess) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, agency_id')
      .eq('id', clientId)
      .single();
    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceName = instanceNameFor(clientId);

    async function fetchQr(): Promise<string | null> {
      const res = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
        headers: { apikey: evolutionApiKey! },
      });
      if (!res.ok) return null;
      const data = await res.json();
      // ponytail: Evolution has nested this under different keys across
      // versions (data.qrcode.base64, data.base64, data.qr) — try them all.
      return data?.qrcode?.base64 ?? data?.base64 ?? data?.qr ?? null;
    }

    async function ensureNumberRow(status: 'pending' | 'connected' | 'disconnected') {
      const { data: existing } = await supabase
        .from('whatsapp_numbers')
        .select('id')
        .eq('phone_number_id', instanceName)
        .eq('client_id', clientId)
        .maybeSingle();

      if (existing) {
        await supabase.from('whatsapp_numbers').update({ status }).eq('id', existing.id);
        return existing.id;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_numbers')
        .insert({
          client_id: clientId,
          tenant_id: client.agency_id,
          phone_number: 'pending',
          phone_number_id: instanceName,
          waba_id: 'evolution',
          status,
        })
        .select('id')
        .single();
      if (insertError) throw new Error(insertError.message);
      return inserted.id;
    }

    switch (action) {
      case 'start': {
        const createRes = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
              url: `${supabaseUrl}/functions/v1/whatsapp-webhook-evolution`,
              byEvents: false,
              base64: false,
              headers: { authorization: `Bearer ${webhookSecret}` },
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
            },
          }),
        });

        let qr: string | null = null;
        if (createRes.ok) {
          const data = await createRes.json();
          qr = data?.qrcode?.base64 ?? data?.base64 ?? data?.qr ?? null;
        }
        // Instance already exists from a previous attempt — just fetch a fresh QR.
        if (!qr) {
          qr = await fetchQr();
        }

        if (!qr) {
          return new Response(
            JSON.stringify({ error: 'Could not get a QR code from the WhatsApp gateway' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await ensureNumberRow('pending');

        return new Response(
          JSON.stringify({ instance: instanceName, qr }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        const stateRes = await fetch(
          `${evolutionApiUrl}/instance/connectionState/${instanceName}`,
          { headers: { apikey: evolutionApiKey } }
        );
        const stateData = stateRes.ok ? await stateRes.json() : null;
        const state = stateData?.instance?.state ?? stateData?.state ?? 'close';

        if (state === 'open') {
          await ensureNumberRow('connected');
          return new Response(
            JSON.stringify({ state: 'connected' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Baileys QR codes expire after ~20-60s; fetch a fresh one each poll.
        const qr = await fetchQr();
        return new Response(
          JSON.stringify({ state: 'connecting', qr }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'disconnect': {
        if (!numberId) {
          return new Response(JSON.stringify({ error: 'numberId is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: evolutionApiKey },
        });
        await supabase
          .from('whatsapp_numbers')
          .update({ status: 'disconnected' })
          .eq('id', numberId)
          .eq('client_id', clientId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Error in whatsapp-qr function:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
