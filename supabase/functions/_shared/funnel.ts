// Pure helpers for the WOB lead funnel. No Deno/network APIs here so Vitest can run them.

export type Stage = "new" | "real" | "qualified" | "client" | "not_lead";
export type Platform = "tiktok" | "meta";

const RANK: Record<Stage, number> = { new: 0, real: 1, qualified: 2, client: 3, not_lead: -1 };

// Stages only move forward; not_lead is terminal (blocks future events).
export function canAdvance(current: Stage | null | undefined, next: Stage): boolean {
  const cur = (current ?? "new") as Stage;
  if (cur === "not_lead") return false;
  if (next === "not_lead") return true;
  return RANK[next] > RANK[cur];
}

const EVENTS: Record<Platform, Partial<Record<Stage, string>>> = {
  tiktok: { real: "Contact", qualified: "SubmitForm", client: "Purchase" },
  meta: { real: "Contact", qualified: "Lead", client: "Purchase" },
};

export function eventNameFor(platform: Platform, stage: Stage): string | null {
  return EVENTS[platform][stage] ?? null;
}

export function eventIdFor(leadId: string, stage: Stage, platform: Platform): string {
  return `${leadId}:${stage}:${platform}`;
}

export interface EventInput {
  eventName: string;
  eventId: string;
  eventTime: number; // unix seconds
  clickId: string;
  phoneHash: string;
  value?: number | null;
  currency?: string | null;
}

export function buildTikTokPayload(pixelCode: string, e: EventInput) {
  const properties: Record<string, unknown> = { content_type: "product", description: "WhatsApp conversation" };
  if (e.value != null) {
    properties.value = e.value;
    properties.currency = e.currency ?? "USD";
  }
  return {
    event_source: "web",
    event_source_id: pixelCode,
    data: [{
      event: e.eventName,
      event_time: e.eventTime,
      event_id: e.eventId,
      user: { ttclid: e.clickId, phone: e.phoneHash },
      properties,
      page: { url: "https://wa.me/" },
    }],
  };
}

export interface MetaEventInput {
  eventName: string;
  eventId: string;
  eventTime: number; // unix seconds
  phoneHash: string; // sha256 of digits incl. country code (Meta's ph format)
  value?: number | null;
  currency?: string | null;
  fbclid?: string | null;
  fbclidAtMs?: number | null; // when the click was seen; defaults to eventTime
  actionSource?: string;
}

// Meta wants fbc as fb.<subdomainIndex>.<clickTimeMs>.<fbclid>.
export function buildFbc(fbclid: string, clickedAtMs: number): string {
  return `fb.1.${Math.round(clickedAtMs)}.${fbclid}`;
}

// Events go to the client's pixel through the Conversions API. ctwa_clid and
// messaging_channel are deliberately absent: they only work for WhatsApp Business
// Account-linked datasets, which QR-connected numbers don't have. Matching is the
// hashed phone, plus fbc when the first message carried an fbclid.
export function buildMetaPayload(e: MetaEventInput) {
  const userData: Record<string, unknown> = { ph: [e.phoneHash] };
  if (e.fbclid) userData.fbc = buildFbc(e.fbclid, e.fbclidAtMs ?? e.eventTime * 1000);
  const event: Record<string, unknown> = {
    event_name: e.eventName,
    event_time: e.eventTime,
    event_id: e.eventId,
    action_source: e.actionSource ?? "chat",
    user_data: userData,
  };
  if (e.value != null) event.custom_data = { value: e.value, currency: e.currency ?? "USD" };
  return { data: [event] };
}

// ---- message-text attribution (TikTok has no referral object) ----
export function extractClidFromText(message: string): string | null {
  // (?<!fb) keeps "fbclid=..." (Meta) from being read as a TikTok click id.
  const m = message.match(/(?:ttclid|ctwa_clid|(?<!fb)clid)[=:]?\s*([a-zA-Z0-9_.-]{6,})/i);
  if (m) return m[1];
  const urlMatch = message.match(/[?&]tt?clid=([^&\s]+)/i);
  return urlMatch ? urlMatch[1] : null;
}

// Website-click Meta ads: the landing page puts the fbclid in the prefilled WhatsApp text.
export function extractFbclid(message: string): string | null {
  const m = message.match(/fbclid[=:]\s*([A-Za-z0-9_-]{8,})/i);
  return m ? m[1] : null;
}

export function extractCampaignCode(message: string): string | null {
  const m = message.match(/\bcid[=:]\s*([a-zA-Z0-9_-]{3,})/i);
  return m ? m[1] : null;
}

// ---- Click-to-WhatsApp ad context from a Baileys message ----
// ponytail: field names vary across WhatsApp/Baileys versions; covers externalAdReply
// and the conversion* fields seen in the wild. Verify with one real CTWA ad.
export interface AdContext {
  ctwaClid: string | null;
  adId: string | null;
  sourceUrl: string | null;
  headline: string | null;
}

export function parseAdContext(message: any): AdContext | null {
  if (!message || typeof message !== "object") return null;
  const ci =
    message.contextInfo ??
    message.extendedTextMessage?.contextInfo ??
    message.imageMessage?.contextInfo ??
    message.videoMessage?.contextInfo ??
    message.messageContextInfo ??
    null;
  const ext = ci?.externalAdReply;
  const ctwaClid = ext?.ctwaClid ?? ci?.ctwaClid ?? ci?.conversionData?.ctwaClid ?? null;
  if (!ext && !ctwaClid && !ci?.conversionSource) return null;
  return {
    ctwaClid: ctwaClid ? String(ctwaClid) : null,
    adId: ext?.sourceId ? String(ext.sourceId) : null,
    sourceUrl: ext?.sourceUrl ?? null,
    headline: ext?.title ?? null,
  };
}

// ---- AI follow-ups ----
export interface FollowUpInput {
  agentStatus: string;
  followUpEnabled: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastFollowUpAt: string | null;
  followUpCount: number;
  followUpMax: number;
  delayHours: number;
  allowedStart: number; // hour 0-23, local
  allowedEnd: number; // hour 0-24, local
  timezone: string;
  now: Date;
}

export function localHour(now: Date, timezone: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now);
    return Number(h);
  } catch {
    return now.getUTCHours();
  }
}

export function isFollowUpEligible(i: FollowUpInput): boolean {
  if (i.agentStatus !== "ai_active" || !i.followUpEnabled) return false;
  if (i.followUpCount >= i.followUpMax) return false;
  if (!i.lastOutboundAt) return false;
  const out = Date.parse(i.lastOutboundAt);
  const inb = i.lastInboundAt ? Date.parse(i.lastInboundAt) : 0;
  if (inb > out) return false; // lead spoke last: nothing to chase
  const delayMs = i.delayHours * 3600_000;
  if (i.now.getTime() - out < delayMs) return false;
  if (i.lastFollowUpAt && i.now.getTime() - Date.parse(i.lastFollowUpAt) < delayMs) return false;
  const h = localHour(i.now, i.timezone);
  return i.allowedStart <= i.allowedEnd
    ? h >= i.allowedStart && h < i.allowedEnd
    : h >= i.allowedStart || h < i.allowedEnd;
}

const OPT_OUT = /^\s*(stop|unsubscribe|توقف|الغاء|إلغاء|ايقاف|إيقاف)\s*[.!]?\s*$/i;
export function isOptOut(text: string): boolean {
  return OPT_OUT.test(text);
}

// ---- LLM output guards ----
export interface Analysis {
  is_spam: boolean;
  stage: "real" | "qualified" | "client";
  order_value: number | null;
  currency: string | null;
  confidence: number;
  evidence: string;
  language: string;
}

export function parseAnalysis(raw: string): Analysis | null {
  try {
    const o = JSON.parse(raw);
    if (typeof o.is_spam !== "boolean" || !["real", "qualified", "client"].includes(o.stage)) return null;
    const conf = Number(o.confidence);
    return {
      is_spam: o.is_spam,
      stage: o.stage,
      order_value: o.order_value == null || isNaN(Number(o.order_value)) ? null : Number(o.order_value),
      currency: typeof o.currency === "string" && o.currency ? o.currency.toUpperCase().slice(0, 3) : null,
      confidence: isNaN(conf) ? 0 : Math.max(0, Math.min(1, conf)),
      evidence: String(o.evidence ?? "").slice(0, 500),
      language: String(o.language ?? ""),
    };
  } catch {
    return null;
  }
}
