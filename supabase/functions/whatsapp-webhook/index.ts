import { scoreLead } from "../_shared/scoring.ts";
import { serviceClient } from "../_shared/auth.ts";
import { reportStage } from "../_shared/conversions.ts";
import { extractCampaignCode, extractClidFromText, isOptOut, parseAdContext } from "../_shared/funnel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const GRAPH = 'https://graph.facebook.com/v21.0';

async function hashPhone(phone: string): Promise<string> {
  const data = new TextEncoder().encode(phone.replace(/\D/g, ''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Meta signs every Cloud API delivery with HMAC-SHA256 of the raw body (App Secret). Fails closed.
async function verifyMetaSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const provided = header.slice(7);
  if (provided.length !== mac.length * 2) return false;
  return timingSafeEqual(hexToBytes(provided), mac);
}

// QR gateways (Evolution / Green-API) send the shared bearer token we registered. Fails closed.
function verifyGatewayToken(req: Request): boolean {
  const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  return !!expected && (req.headers.get('authorization') || '') === `Bearer ${expected}`;
}

interface Referral {
  ctwaClid: string | null;
  adId: string | null;
  sourceType: string | null;
  headline: string | null;
  clickTs: number | null;
}

function readMetaReferral(message: any): Referral | null {
  const ref = message?.referral ?? message?.context?.referral ?? null;
  if (!ref) return null;
  return {
    ctwaClid: ref.ctwa_clid ?? ref.ctwaClid ?? null,
    adId: ref.source_type === 'ad' ? ref.source_id ?? null : null,
    sourceType: ref.source_type ?? null,
    headline: ref.headline ?? null,
    clickTs: ref.click_timestamp ? Number(ref.click_timestamp) : null,
  };
}

interface WaMessage {
  num: { id: string; client_id: string; tenant_id: string };
  jid: string; // customer's chat id (used to reply)
  text: string;
  ts: Date;
  externalId: string | null;
  fromMe: boolean;
  referral: Referral | null;
}

async function findNumber(supabase: any, key: string) {
  const { data } = await supabase
    .from('whatsapp_numbers').select('id, client_id, tenant_id, status')
    .eq('phone_number_id', key).maybeSingle();
  return data?.client_id ? data : null;
}

async function resolveMetaCampaign(supabase: any, clientId: string, adId: string): Promise<string | null> {
  const { data: acct } = await supabase.from('meta_accounts').select('access_token')
    .eq('client_id', clientId).neq('ad_account_id', 'pending').limit(1).maybeSingle();
  if (!acct?.access_token) return null;
  try {
    const r = await fetch(`${GRAPH}/${adId}?fields=campaign_id&access_token=${encodeURIComponent(acct.access_token)}`);
    const d = await r.json();
    return d?.campaign_id ?? null;
  } catch {
    return null;
  }
}

async function createLead(supabase: any, m: WaMessage, phoneHash: string) {
  const textClid = extractClidFromText(m.text);
  const isMeta = Boolean(m.referral);
  const ctwaClid = m.referral?.ctwaClid ?? null;
  const attributionSource = m.referral?.ctwaClid ? 'referral' : m.referral ? 'referral_partial' : textClid ? 'message_text' : 'none';
  const clientId = m.num.client_id;

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [velocityRes, senderRes, dupRes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', tenMinAgo),
    supabase.from('leads').select('source_id, ctwa_clid').eq('sender_phone_hash', phoneHash).limit(50),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('first_message', m.text),
  ]);
  const senderLeads = senderRes.data ?? [];
  const distinctSources = new Set(senderLeads.map((l: any) => l.source_id).filter(Boolean)).size;
  const clickToMessageSeconds = m.referral?.clickTs
    ? Math.max(0, Math.round((m.ts.getTime() - m.referral.clickTs * 1000) / 1000))
    : null;

  const scored = scoreLead({
    message: m.text,
    hasReferral: isMeta,
    ctwaClid: ctwaClid ?? textClid,
    clickToMessageSeconds,
    clientVelocity10m: velocityRes.count ?? 0,
    senderLeadCount: senderLeads.length,
    senderDistinctSources: distinctSources,
    duplicateMessageText: (dupRes.count ?? 0) > 0,
  });

  const adPlatform = isMeta ? 'meta' : textClid ? 'tiktok' : null;
  const campaignId = isMeta && m.referral?.adId
    ? await resolveMetaCampaign(supabase, clientId, m.referral.adId)
    : extractCampaignCode(m.text);

  const { data: lead, error } = await supabase.from('leads').insert({
    client_id: clientId,
    tenant_id: m.num.tenant_id,
    whatsapp_number_id: m.num.id,
    sender_phone_hash: phoneHash,
    ttclid: textClid,
    ctwa_clid: ctwaClid,
    source_id: m.referral?.adId ?? null,
    source_type: m.referral?.sourceType ?? null,
    referral_headline: m.referral?.headline ?? null,
    attribution_source: attributionSource,
    ad_platform: adPlatform,
    campaign_id: campaignId,
    ad_id: m.referral?.adId ?? null,
    first_message: m.text,
    status: scored.status,
    is_real: scored.isReal,
    quality_score: scored.score,
    quality_signals: scored.signals,
    is_repeat_lead: senderLeads.length > 0,
    message_received_at: m.ts.toISOString(),
    click_to_message_seconds: clickToMessageSeconds,
  }).select('id').single();

  if (error) {
    console.error('Error inserting lead:', error);
    return null;
  }
  console.log(`Lead ${lead.id} client=${clientId} score=${scored.score} status=${scored.status} attribution=${attributionSource}`);
  return { id: lead.id, isReal: scored.isReal };
}

async function aiEnabled(supabase: any, clientId: string): Promise<boolean> {
  const { data } = await supabase.from('ai_agent_settings').select('enabled').eq('client_id', clientId).maybeSingle();
  return Boolean(data?.enabled);
}

function triggerAiAgent(conversationId: string) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const p = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-internal-key': key },
    body: JSON.stringify({ conversationId }),
  }).catch((e) => console.error('ai-agent trigger failed', e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(p);
}

async function handleMessage(supabase: any, m: WaMessage) {
  const clientId = m.num.client_id;
  const phoneHash = await hashPhone(m.jid.split('@')[0]);
  const now = m.ts.toISOString();

  const { data: existingLead } = await supabase.from('leads').select('id')
    .eq('client_id', clientId).eq('sender_phone_hash', phoneHash)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  // ---- Outgoing: the business typed on its phone (or the echo of an AI send)
  if (m.fromMe) {
    if (!existingLead) return; // business started the chat; not an ad lead
    const { data: conv } = await supabase.from('conversations').select('id, agent_status')
      .eq('lead_id', existingLead.id).maybeSingle();
    if (!conv) return;
    if (m.externalId) {
      const { data: known } = await supabase.from('messages').select('id').eq('external_id', m.externalId).maybeSingle();
      if (known) return;
      const { data: pending } = await supabase.from('messages').select('id')
        .eq('conversation_id', conv.id).eq('author', 'ai').eq('text', m.text)
        .like('external_id', 'pending:%').limit(1).maybeSingle();
      if (pending) {
        await supabase.from('messages').update({ external_id: m.externalId }).eq('id', pending.id);
        return;
      }
    }
    const { error } = await supabase.from('messages').insert({
      conversation_id: conv.id, client_id: clientId, direction: 'out', author: 'owner', text: m.text, external_id: m.externalId,
    });
    if (error?.code === '23505') return;
    const patch: Record<string, unknown> = { last_outbound_at: now, last_message_at: now };
    if (conv.agent_status === 'ai_active') patch.agent_status = 'handed_off'; // owner took over
    await supabase.from('conversations').update(patch).eq('id', conv.id);
    return;
  }

  // ---- Incoming from the customer
  let leadId = existingLead?.id as string | undefined;
  let newRealLead = false;
  if (!leadId) {
    const created = await createLead(supabase, m, phoneHash);
    if (!created) return;
    leadId = created.id;
    newRealLead = created.isReal;
  }

  const ai = await aiEnabled(supabase, clientId);
  let { data: conv } = await supabase.from('conversations').select('id, agent_status').eq('lead_id', leadId).maybeSingle();
  if (!conv) {
    const { data: inserted, error } = await supabase.from('conversations').insert({
      client_id: clientId,
      whatsapp_number_id: m.num.id,
      lead_id: leadId,
      agent_status: ai ? 'ai_active' : 'off',
      follow_up_count: 0,
    }).select('id, agent_status').single();
    if (error) {
      // Concurrent delivery created it first.
      ({ data: conv } = await supabase.from('conversations').select('id, agent_status').eq('lead_id', leadId).maybeSingle());
    } else {
      conv = inserted;
      await supabase.from('conversation_contacts').insert({ conversation_id: conv.id, contact_jid: m.jid });
    }
  }
  if (!conv) return;

  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conv.id, client_id: clientId, direction: 'in', author: 'lead', text: m.text, external_id: m.externalId,
  });
  if (msgErr?.code === '23505') return; // duplicate delivery
  if (msgErr) console.error('message insert failed', msgErr);

  const patch: Record<string, unknown> = { last_inbound_at: now, last_message_at: now, follow_up_count: 0 };
  let status = conv.agent_status;
  if (isOptOut(m.text)) status = patch.agent_status = 'opted_out';
  else if (ai && status === 'off') status = patch.agent_status = 'ai_active';
  await supabase.from('conversations').update(patch).eq('id', conv.id);

  if (newRealLead) await reportStage(supabase, leadId, 'real');
  if (ai && status === 'ai_active') triggerAiAgent(conv.id);
}

// Evolution API (QR / linked device) events
async function handleEvolution(supabase: any, body: any) {
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
    // Prefer the real phone JID when WhatsApp hides it behind a @lid id
    const jid: string = [key.remoteJid, key.remoteJidAlt, key.senderPn]
      .find((j: any) => typeof j === 'string' && j.endsWith('@s.whatsapp.net')) || '';
    if (!jid) continue; // groups, broadcasts, status, or unresolved lid

    const msg = d.message || {};
    const text: string =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      msg.imageMessage?.caption ??
      msg.videoMessage?.caption ??
      msg.buttonsResponseMessage?.selectedDisplayText ??
      msg.listResponseMessage?.title ??
      `[${d.messageType || 'message'}]`;

    const ad = parseAdContext(msg) ?? parseAdContext(d);
    const ts = Number(d.messageTimestamp);
    await handleMessage(supabase, {
      num,
      jid,
      text,
      ts: ts ? new Date(ts * 1000) : new Date(),
      externalId: key.id ?? null,
      fromMe: Boolean(key.fromMe),
      referral: ad ? { ctwaClid: ad.ctwaClid, adId: ad.adId, sourceType: 'ad', headline: ad.headline, clickTs: null } : null,
    });
  }
}

// Green-API (QR / linked device) notifications
async function handleGreen(supabase: any, body: any) {
  const num = await findNumber(supabase, String(body.instanceData?.idInstance ?? ''));
  if (!num) {
    console.log('Gateway instance not mapped to a client, skipping');
    return;
  }

  if (body.typeWebhook === 'stateInstanceChanged') {
    await supabase.from('whatsapp_numbers')
      .update({ status: body.stateInstance === 'authorized' ? 'connected' : 'disconnected' }).eq('id', num.id);
    return;
  }
  const fromMe = body.typeWebhook === 'outgoingMessageReceived';
  if (body.typeWebhook !== 'incomingMessageReceived' && !fromMe) return;

  const chatId: string = body.senderData?.chatId || '';
  if (!chatId.endsWith('@c.us')) return; // ignore groups, broadcasts, status

  const md = body.messageData || {};
  const text: string =
    md.textMessageData?.textMessage ??
    md.extendedTextMessageData?.text ??
    md.fileMessageData?.caption ??
    `[${md.typeMessage || 'message'}]`;

  await handleMessage(supabase, {
    num,
    jid: chatId,
    text,
    ts: body.timestamp ? new Date(Number(body.timestamp) * 1000) : new Date(),
    externalId: body.idMessage ?? null,
    fromMe,
    referral: null,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const ok = () => new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const deny = () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Meta webhook verification handshake
  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    if (verifyToken && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken) {
      return new Response(url.searchParams.get('hub.challenge'), { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const supabase = serviceClient();

    if (typeof body?.event === 'string' && body?.instance) {
      if (!verifyGatewayToken(req)) return deny();
      await handleEvolution(supabase, body);
      return ok();
    }
    if (body?.typeWebhook) {
      if (!verifyGatewayToken(req)) return deny();
      await handleGreen(supabase, body);
      return ok();
    }

    // Meta Cloud API format
    if (!(await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256')))) return deny();
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const num = await findNumber(supabase, value.metadata?.phone_number_id);
        if (!num) continue;
        for (const message of value.messages || []) {
          const text = message.type === 'text'
            ? (message.text?.body || '')
            : (message.button?.text || message.interactive?.list_reply?.title || `[${message.type}]`);
          await handleMessage(supabase, {
            num,
            jid: String(message.from),
            text,
            ts: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
            externalId: message.id ?? null,
            fromMe: false,
            referral: readMetaReferral(message),
          });
        }
      }
    }
    return ok();
  } catch (error: unknown) {
    console.error('Error processing WhatsApp webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
