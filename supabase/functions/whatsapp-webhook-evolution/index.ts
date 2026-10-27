import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestInboundMessage } from "../_shared/leadIngest.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Evolution API doesn't sign webhook bodies (unlike Meta's HMAC). Instead we
// set a shared secret as a custom header when the instance is created
// (see whatsapp-qr/index.ts) and check for it here. Fails closed if unset.
function verifyWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
  if (!expected) {
    console.error('EVOLUTION_WEBHOOK_SECRET not configured; refusing to process webhook');
    return false;
  }
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return provided === expected;
}

// Extracts the text out of whichever Baileys message shape was sent.
// ponytail: covers the common message types; anything else falls through to
// a placeholder rather than crashing — log the raw shape if you hit one.
function extractMessageText(message: any): string {
  if (!message) return '';
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    (message ? `[${Object.keys(message)[0] ?? 'unknown'}]` : '')
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!verifyWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

  try {
    const body = await req.json();
    // Evolution v2 webhook envelope: { event, instance, data, ... }
    const event: string = body.event ?? '';
    const instanceName: string | undefined = body.instance ?? body.data?.instance;

    if (!instanceName) {
      console.error('Evolution webhook missing instance name', body);
      return new Response(JSON.stringify({ error: 'Missing instance' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: whatsappNumber } = await supabase
      .from('whatsapp_numbers')
      .select('id, client_id, tenant_id')
      .eq('phone_number_id', instanceName)
      .maybeSingle();

    if (!whatsappNumber?.client_id) {
      console.log(`Evolution instance ${instanceName} not mapped to a client, skipping`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (event.toLowerCase() === 'connection.update') {
      const state = body.data?.state ?? body.data?.instance?.state;
      if (state === 'open') {
        let phoneNumber: string | null = null;
        if (evolutionApiUrl && evolutionApiKey) {
          try {
            const infoRes = await fetch(
              `${evolutionApiUrl}/instance/fetchInstances?instanceName=${instanceName}`,
              { headers: { apikey: evolutionApiKey } }
            );
            const info = await infoRes.json();
            // ponytail: field name varies by Evolution version — verify against
            // your deployment and adjust if the phone number doesn't show up.
            const first = Array.isArray(info) ? info[0] : info;
            const ownerJid = first?.instance?.owner ?? first?.owner ?? first?.ownerJid;
            phoneNumber = ownerJid ? ownerJid.split('@')[0] : null;
          } catch (e) {
            console.error('Failed to fetch Evolution instance info', e);
          }
        }
        await supabase
          .from('whatsapp_numbers')
          .update({
            status: 'connected',
            ...(phoneNumber ? { phone_number: phoneNumber } : {}),
          })
          .eq('id', whatsappNumber.id);
      } else if (state === 'close') {
        await supabase
          .from('whatsapp_numbers')
          .update({ status: 'disconnected' })
          .eq('id', whatsappNumber.id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (event.toLowerCase() === 'messages.upsert') {
      const messages = Array.isArray(body.data) ? body.data : [body.data];

      for (const msg of messages) {
        if (!msg || msg.key?.fromMe) continue; // skip outbound/echo

        const senderJid: string | undefined = msg.key?.remoteJid;
        if (!senderJid) continue;
        const senderPhone = senderJid.split('@')[0];
        const messageText = extractMessageText(msg.message);
        const messageTs = msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000)
          : new Date();

        await ingestInboundMessage(supabase, {
          whatsappNumber,
          senderPhone,
          messageText,
          messageTimestamp: messageTs,
          // TikTok doesn't attach referral metadata to WhatsApp messages the
          // way Meta ads do — attribution here relies entirely on a ttclid
          // baked into the prefilled message text (see extractClidFromText).
          referral: null,
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error processing Evolution webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
