import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestInboundMessage } from "../_shared/leadIngest.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Meta signs every webhook delivery with HMAC-SHA256 of the raw body, keyed
 * by the app secret, in the `X-Hub-Signature-256: sha256=<hex>` header.
 * Without this check anyone who finds the URL can post fabricated leads.
 */
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!appSecret) {
    console.error('WHATSAPP_APP_SECRET not configured; refusing to process webhook');
    return false;
  }
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const providedHex = signatureHeader.slice('sha256='.length);
  if (providedHex.length !== expectedHex.length) return false;
  return timingSafeEqual(hexToBytes(providedHex), hexToBytes(expectedHex));
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
      const rawBody = await req.text();

      const signatureValid = await verifyMetaSignature(
        rawBody,
        req.headers.get('x-hub-signature-256')
      );
      if (!signatureValid) {
        console.error('WhatsApp webhook signature verification failed');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = JSON.parse(rawBody);
      console.log(`Received WhatsApp webhook: ${body.entry?.length ?? 0} entry(ies)`);

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
            const referral = readReferral(message);

            const messageTs = message.timestamp
              ? new Date(Number(message.timestamp) * 1000)
              : new Date();

            // click-to-message gap, when the referral carried a click time
            let clickToMessageSeconds: number | null = null;
            const refClickTs = (message as any)?.referral?.click_timestamp;
            if (refClickTs) {
              clickToMessageSeconds = Math.max(
                0,
                Math.round((messageTs.getTime() - Number(refClickTs) * 1000) / 1000)
              );
            }

            await ingestInboundMessage(supabase, {
              whatsappNumber,
              senderPhone,
              messageText,
              messageTimestamp: messageTs,
              referral: referral
                ? {
                    ctwaClid: referral.ctwaClid,
                    sourceId: referral.sourceId,
                    sourceType: referral.sourceType,
                    headline: referral.headline,
                  }
                : null,
              clickToMessageSeconds,
            });
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
