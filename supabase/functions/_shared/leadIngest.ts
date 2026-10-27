import { scoreLead } from "./scoring.ts";

export async function hashPhone(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone.replace(/\D/g, ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy fallback: some setups pre-fill the wa.me text with the click id.
// This is the ONLY attribution path for TikTok ads (TikTok doesn't attach a
// referral object to WhatsApp messages the way Meta's Click-to-WhatsApp ads
// do) — the TikTok ad's prefilled message must contain a ttclid/campaign code.
export function extractClidFromText(message: string): string | null {
  const m = message.match(/(?:ttclid|ctwa_clid)[=:]?\s*([a-zA-Z0-9_.-]+)/i);
  if (m) return m[1];
  const urlMatch = message.match(/[?&]tt?clid=([^&\s]+)/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

// Send conversion event to TikTok CAPI
export async function sendTikTokConversion(
  supabase: any,
  clientId: string,
  phoneHash: string,
  clid: string
) {
  try {
    // Tokens are Vault-encrypted; this RPC decrypts them for this client's accounts.
    const { data: accounts } = await supabase.rpc('get_tiktok_tokens_for_client', {
      _client_id: clientId,
    });
    const account = accounts?.[0];

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

export interface Referral {
  ctwaClid: string | null;
  sourceId: string | null;
  sourceType: string | null;
  headline: string | null;
}

export interface InboundMessage {
  whatsappNumber: { id: string; client_id: string; tenant_id: string | null };
  senderPhone: string;
  messageText: string;
  messageTimestamp: Date;
  referral: Referral | null;
  clickToMessageSeconds?: number | null;
}

// Shared by every WhatsApp source (Meta Cloud API, Evolution/Baileys QR
// bridge, ...): dedupe by sender, score the message, insert the lead, and
// fire the TikTok conversion if it's real and attributable.
export async function ingestInboundMessage(supabase: any, input: InboundMessage) {
  const phoneHash = await hashPhone(input.senderPhone);
  const textClid = extractClidFromText(input.messageText);
  const ctwaClid = input.referral?.ctwaClid ?? textClid ?? null;
  const attributionSource = input.referral?.ctwaClid
    ? 'referral'
    : input.referral
    ? 'referral_partial'
    : textClid
    ? 'message_text'
    : 'none';

  // Only the FIRST message per phone number per client counts.
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('client_id', input.whatsappNumber.client_id)
    .eq('sender_phone_hash', phoneHash)
    .maybeSingle();

  if (existingLead) {
    console.log(`Lead already exists for ${phoneHash} / client ${input.whatsappNumber.client_id}`);
    return null;
  }

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [velocityRes, senderRes, dupRes] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', input.whatsappNumber.client_id)
      .gte('created_at', tenMinAgo),
    supabase
      .from('leads')
      .select('source_id, ctwa_clid')
      .eq('sender_phone_hash', phoneHash)
      .limit(50),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', input.whatsappNumber.client_id)
      .eq('first_message', input.messageText),
  ]);

  const senderLeads = senderRes.data ?? [];
  const distinctSources = new Set(
    senderLeads.map((l: any) => l.source_id).filter(Boolean)
  ).size;

  const scored = scoreLead({
    message: input.messageText,
    hasReferral: Boolean(input.referral),
    ctwaClid,
    clickToMessageSeconds: input.clickToMessageSeconds ?? null,
    clientVelocity10m: velocityRes.count ?? 0,
    senderLeadCount: senderLeads.length,
    senderDistinctSources: distinctSources,
    duplicateMessageText: (dupRes.count ?? 0) > 0,
  });

  const { data: newLead, error: insertError } = await supabase
    .from('leads')
    .insert({
      client_id: input.whatsappNumber.client_id,
      tenant_id: input.whatsappNumber.tenant_id,
      whatsapp_number_id: input.whatsappNumber.id,
      sender_phone_hash: phoneHash,
      ttclid: ctwaClid,
      ctwa_clid: ctwaClid,
      source_id: input.referral?.sourceId ?? null,
      source_type: input.referral?.sourceType ?? null,
      referral_headline: input.referral?.headline ?? null,
      attribution_source: attributionSource,
      first_message: input.messageText,
      status: scored.status,
      is_real: scored.isReal,
      quality_score: scored.score,
      quality_signals: scored.signals,
      is_repeat_lead: senderLeads.length > 0,
      message_received_at: input.messageTimestamp.toISOString(),
      click_to_message_seconds: input.clickToMessageSeconds ?? null,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error inserting lead:', insertError);
    return null;
  }

  console.log(
    `Lead ${newLead.id} client=${input.whatsappNumber.client_id} score=${scored.score} status=${scored.status} attribution=${attributionSource}`
  );

  // Only genuine, attributable conversations go back to TikTok.
  if (scored.isReal && ctwaClid) {
    await sendTikTokConversion(supabase, input.whatsappNumber.client_id, phoneHash, ctwaClid);
  }

  return newLead;
}
