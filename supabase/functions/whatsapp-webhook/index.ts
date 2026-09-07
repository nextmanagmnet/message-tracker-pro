import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scoreLead } from "./scoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to hash phone number using SHA256
async function hashPhone(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone.replace(/\D/g, ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy fallback only: some setups pre-fill the wa.me text with the click id.
function extractClidFromText(message: string): string | null {
  const m = message.match(/(?:ttclid|ctwa_clid)[=:]?\s*([a-zA-Z0-9_.-]+)/i);
  if (m) return m[1];
  const urlMatch = message.match(/[?&]tt?clid=([^&\s]+)/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

/**
 * Meta Click-to-WhatsApp ads attach a `referral` object to the first inbound
 * message. It carries the click id and the source ad, with no dependence on
 * the message body at all — this is the primary attribution path.
 */
function readReferral(message: any) {
  const ref = message?.referral ?? message?.context?.referral ?? null;
  if (!ref) return null;
  return {
    ctwaClid: ref.ctwa_clid ?? ref.ctwaClid ?? null,
    sourceId: ref.source_id ?? null,
    sourceType: ref.source_type ?? null,
    sourceUrl: ref.source_url ?? null,
    headline: ref.headline ?? null,
    body: ref.body ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // WhatsApp webhook verification (GET request)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WhatsApp webhook verified');
      return new Response(challenge, { status: 200 });
    }

    console.error('WhatsApp webhook verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Received WhatsApp webhook:', JSON.stringify(body));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const phoneNumberId = value.metadata?.phone_number_id;

          const { data: whatsappNumber, error: numberError } = await supabase
            .from('whatsapp_numbers')
            .select('id, client_id, tenant_id')
            .eq('phone_number_id', phoneNumberId)
            .maybeSingle();

          if (numberError || !whatsappNumber?.client_id) {
            console.log(`WhatsApp number ${phoneNumberId} not mapped to a client, skipping`);
            continue;
          }

          for (const message of value.messages || []) {
            const messageText =
              message.type === 'text'
                ? (message.text?.body || '')
                : (message.button?.text || message.interactive?.list_reply?.title || `[${message.type}]`);

            const senderPhone = message.from;
            const phoneHash = await hashPhone(senderPhone);

            // ---- Attribution: referral object first, message text as fallback
            const referral = readReferral(message);
            const textClid = extractClidFromText(messageText);
            const ctwaClid = referral?.ctwaClid ?? textClid ?? null;
            const attributionSource = referral?.ctwaClid
              ? 'referral'
              : referral
              ? 'referral_partial'
              : textClid
              ? 'message_text'
              : 'none';

            const messageTs = message.timestamp
              ? new Date(Number(message.timestamp) * 1000)
              : new Date();

            // Only the FIRST message per phone number per client counts.
            const { data: existingLead } = await supabase
              .from('leads')
              .select('id')
              .eq('client_id', whatsappNumber.client_id)
              .eq('sender_phone_hash', phoneHash)
              .maybeSingle();

            if (existingLead) {
              console.log(`Lead already exists for ${phoneHash} / client ${whatsappNumber.client_id}`);
              continue;
            }

            // ---- Behavioural signals
            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const [velocityRes, senderRes, dupRes] = await Promise.all([
              supabase
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', whatsappNumber.client_id)
                .gte('created_at', tenMinAgo),
              supabase
                .from('leads')
                .select('source_id, ctwa_clid')
                .eq('sender_phone_hash', phoneHash)
                .limit(50),
              supabase
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', whatsappNumber.client_id)
                .eq('first_message', messageText),
            ]);

            const senderLeads = senderRes.data ?? [];
            const distinctSources = new Set(
              senderLeads.map((l: any) => l.source_id).filter(Boolean)
            ).size;

            // click-to-message gap, when the referral carried a click time
            let clickToMessageSeconds: number | null = null;
            const refClickTs = (message as any)?.referral?.click_timestamp;
            if (refClickTs) {
              clickToMessageSeconds = Math.max(
                0,
                Math.round((messageTs.getTime() - Number(refClickTs) * 1000) / 1000)
              );
            }

            const scored = scoreLead({
              message: messageText,
              hasReferral: Boolean(referral),
              ctwaClid,
              clickToMessageSeconds,
              clientVelocity10m: velocityRes.count ?? 0,
              senderLeadCount: senderLeads.length,
              senderDistinctSources: distinctSources,
              duplicateMessageText: (dupRes.count ?? 0) > 0,
            });

            const { data: newLead, error: insertError } = await supabase
              .from('leads')
              .insert({
                client_id: whatsappNumber.client_id,
                tenant_id: whatsappNumber.tenant_id,
                whatsapp_number_id: whatsappNumber.id,
                sender_phone_hash: phoneHash,
                ttclid: ctwaClid,
                ctwa_clid: ctwaClid,
                source_id: referral?.sourceId ?? null,
                source_type: referral?.sourceType ?? null,
                referral_headline: referral?.headline ?? null,
                attribution_source: attributionSource,
                first_message: messageText,
                status: scored.status,
                is_real: scored.isReal,
                quality_score: scored.score,
                quality_signals: scored.signals,
                is_repeat_lead: senderLeads.length > 0,
                message_received_at: messageTs.toISOString(),
                click_to_message_seconds: clickToMessageSeconds,
              })
              .select()
              .single();

            if (insertError) {
              console.error('Error inserting lead:', insertError);
              continue;
            }

            console.log(
              `Lead ${newLead.id} client=${whatsappNumber.client_id} score=${scored.score} status=${scored.status} attribution=${attributionSource}`
            );

            // Only genuine, attributable conversations go back to TikTok.
            if (scored.isReal && ctwaClid) {
              await sendTikTokConversion(
                supabase,
                whatsappNumber.client_id,
                phoneHash,
                ctwaClid
              );
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error: unknown) {
      console.error('Error processing WhatsApp webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});

// Send conversion event to TikTok CAPI
async function sendTikTokConversion(
  supabase: any,
  clientId: string,
  phoneHash: string,
  clid: string
) {
  try {
    const { data: account } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle();

    if (!account) {
      console.log('No TikTok account found for client');
      return;
    }

    const { data: pixel } = await supabase
      .from('tiktok_pixels')
      .select('pixel_code')
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle();

    if (!pixel) {
      console.log('No TikTok Pixel found for client');
      return;
    }

    const eventData = {
      pixel_code: pixel.pixel_code,
      event: 'Contact',
      event_time: Math.floor(Date.now() / 1000),
      user: {
        ttclid: clid,
        phone: [phoneHash], // Already SHA256 hashed
      },
      properties: {
        content_type: 'product',
        description: 'WhatsApp real conversation',
      },
      page: { url: 'https://wa.me/' },
      event_source: 'whatsapp',
    };

    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
      method: 'POST',
      headers: {
        'Access-Token': account.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [eventData] }),
    });

    const result = await response.json();
    console.log('TikTok conversion event sent for client:', clientId, result);
  } catch (error) {
    console.error('Error sending TikTok conversion:', error);
  }
}
