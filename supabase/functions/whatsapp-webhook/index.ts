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

// Pre-filled wa.me text carries the TikTok click id (QR/linked-device path).
function extractClidFromText(message: string): string | null {
  const m = message.match(/(?:ttclid|ctwa_clid|clid)[=:]?\s*([a-zA-Z0-9_.-]{6,})/i);
  if (m) return m[1];
  const urlMatch = message.match(/[?&]tt?clid=([^&\s]+)/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

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
    clickTs: ref.click_timestamp ?? null,
  };
}

type Referral = ReturnType<typeof readReferral>;

async function processMessage(
  supabase: any,
  whatsappNumber: { id: string; client_id: string; tenant_id: string },
  messageText: string,
  senderPhone: string,
  referral: Referral,
  messageTs: Date,
) {
  const phoneHash = await hashPhone(senderPhone);
  const textClid = extractClidFromText(messageText);
  const ctwaClid = referral?.ctwaClid ?? textClid ?? null;
  const attributionSource = referral?.ctwaClid
    ? 'referral'
    : referral
    ? 'referral_partial'
    : textClid
    ? 'message_text'
    : 'none';

  // Only the FIRST message per phone number per client counts.
  const { data: existingLead } = await supabase
    .from('leads').select('id')
    .eq('client_id', whatsappNumber.client_id)
    .eq('sender_phone_hash', phoneHash)
    .maybeSingle();
  if (existingLead) return;

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [velocityRes, senderRes, dupRes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('client_id', whatsappNumber.client_id).gte('created_at', tenMinAgo),
    supabase.from('leads').select('source_id, ctwa_clid')
      .eq('sender_phone_hash', phoneHash).limit(50),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('client_id', whatsappNumber.client_id).eq('first_message', messageText),
  ]);

  const senderLeads = senderRes.data ?? [];
  const distinctSources = new Set(senderLeads.map((l: any) => l.source_id).filter(Boolean)).size;

  let clickToMessageSeconds: number | null = null;
  if (referral?.clickTs) {
    clickToMessageSeconds = Math.max(0, Math.round((messageTs.getTime() - Number(referral.clickTs) * 1000) / 1000));
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
    .select().single();

  if (insertError) {
    console.error('Error inserting lead:', insertError);
    return;
  }
  console.log(`Lead ${newLead.id} client=${whatsappNumber.client_id} score=${scored.score} status=${scored.status} attribution=${attributionSource}`);

  if (scored.isReal && ctwaClid) {
    await sendTikTokConversion(supabase, whatsappNumber.client_id, phoneHash, ctwaClid);
  }
}

async function findNumber(supabase: any, key: string) {
  const { data } = await supabase
    .from('whatsapp_numbers').select('id, client_id, tenant_id, status')
    .eq('phone_number_id', key).maybeSingle();
  return data?.client_id ? data : null;
}

// Evolution API (QR / linked device) events
async function handleEvolution(supabase: any, body: any, req: Request) {
  const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  const auth = req.headers.get('authorization') || '';
  if (expected && auth !== `Bearer ${expected}`) {
    console.error('Gateway webhook token mismatch');
    return;
  }
  const num = await findNumber(supabase, String(body.instance));
  if (!num) {
    console.log('Gateway instance not mapped to a client, skipping');
    return;
  }
  const event = String(body.event).toLowerCase().replace(/_/g, '.');

  if (event === 'connection.update') {
    const s = body.data?.state;
    if (s === 'open' || s === 'close') {
      await supabase.from('whatsapp_numbers')
        .update({ status: s === 'open' ? 'connected' : 'disconnected' }).eq('id', num.id);
    }
    return;
  }
  if (event !== 'messages.upsert') return;

  const items = Array.isArray(body.data) ? body.data : [body.data];
  for (const d of items) {
    const key = d?.key || {};
    if (key.fromMe) continue;
    // Prefer the real phone JID when WhatsApp hides it behind a @lid id
    const jid: string = [key.remoteJid, key.remoteJidAlt, key.senderPn]
      .find((j: any) => typeof j === 'string' && j.endsWith('@s.whatsapp.net')) || '';
    if (!jid) continue; // groups, broadcasts, status, or unresolved lid

    const m = d.message || {};
    const messageText: string =
      m.conversation ??
      m.extendedTextMessage?.text ??
      m.imageMessage?.caption ??
      m.videoMessage?.caption ??
      m.buttonsResponseMessage?.selectedDisplayText ??
      m.listResponseMessage?.title ??
      `[${d.messageType || 'message'}]`;

    const ts = Number(d.messageTimestamp);
    const messageTs = ts ? new Date(ts * 1000) : new Date();
    await processMessage(supabase, num, messageText, jid.split('@')[0], null, messageTs);
  }
}

// Green-API (QR / linked device) notifications
async function handleGreen(supabase: any, body: any, req: Request) {
  const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  const auth = req.headers.get('Authorization') || '';
  if (expected && auth !== `Bearer ${expected}`) {
    console.error('Gateway webhook token mismatch');
    return;
  }
  const key = String(body.instanceData?.idInstance ?? '');
  const num = await findNumber(supabase, key);
  if (!num) {
    console.log(`Gateway instance not mapped to a client, skipping`);
    return;
  }

  if (body.typeWebhook === 'stateInstanceChanged') {
    const s = body.stateInstance;
    await supabase.from('whatsapp_numbers')
      .update({ status: s === 'authorized' ? 'connected' : 'disconnected' }).eq('id', num.id);
    return;
  }
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const chatId: string = body.senderData?.chatId || '';
  if (!chatId.endsWith('@c.us')) return; // ignore groups, broadcasts, status

  const md = body.messageData || {};
  const messageText: string =
    md.textMessageData?.textMessage ??
    md.extendedTextMessageData?.text ??
    md.fileMessageData?.caption ??
    `[${md.typeMessage || 'message'}]`;

  const messageTs = body.timestamp ? new Date(Number(body.timestamp) * 1000) : new Date();
  await processMessage(supabase, num, messageText, chatId.split('@')[0], null, messageTs);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Meta webhook verification (GET request)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      if (typeof body?.event === 'string' && body?.instance) {
        await handleEvolution(supabase, body, req);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (body?.typeWebhook) {
        await handleGreen(supabase, body, req);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Meta Cloud API format
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          const value = change.value;
          const num = await findNumber(supabase, value.metadata?.phone_number_id);
          if (!num) continue;

          for (const message of value.messages || []) {
            const messageText =
              message.type === 'text'
                ? (message.text?.body || '')
                : (message.button?.text || message.interactive?.list_reply?.title || `[${message.type}]`);
            const messageTs = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
            await processMessage(supabase, num, messageText, message.from, readReferral(message), messageTs);
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
async function sendTikTokConversion(supabase: any, clientId: string, phoneHash: string, clid: string) {
  try {
    const { data: account } = await supabase
      .from('tiktok_accounts').select('*').eq('client_id', clientId).limit(1).maybeSingle();
    if (!account) return;

    const { data: pixel } = await supabase
      .from('tiktok_pixels').select('pixel_code').eq('client_id', clientId).limit(1).maybeSingle();
    if (!pixel) return;

    const eventData = {
      event: 'Contact',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `wa_${phoneHash.slice(0, 16)}_${clid.slice(0, 24)}`,
      user: { ttclid: clid, phone: phoneHash },
      properties: { content_type: 'product', description: 'WhatsApp real conversation' },
      page: { url: 'https://wa.me/' },
    };

    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Access-Token': account.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_source: 'web', event_source_id: pixel.pixel_code, data: [eventData] }),
    });
    const result = await response.json();
    if (result?.code !== 0) console.error('TikTok Events API rejected event:', result);
    console.log('TikTok conversion event sent for client:', clientId, result?.code);
  } catch (error) {
    console.error('Error sending TikTok conversion:', error);
  }
}
