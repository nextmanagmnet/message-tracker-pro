// Provider payload parsing (Meta Cloud API / Evolution / Green-API). Pure: no Deno or network APIs.
import { parseAdContext } from "../_shared/funnel.ts";

export interface Referral {
  ctwaClid: string | null;
  adId: string | null;
  sourceType: string | null;
  headline: string | null;
  clickTs: number | null;
}

export interface WaMessage {
  num: { id: string; client_id: string; tenant_id: string };
  jid: string; // customer's chat id (used to reply)
  text: string;
  ts: Date;
  externalId: string | null;
  fromMe: boolean;
  referral: Referral | null;
}

// A parsed message before it is matched to one of our WhatsApp numbers.
export type InboundMessage = Omit<WaMessage, "num">;

// The referral block Meta attaches to a message that came from an ad.
interface MetaReferral {
  ctwa_clid?: string;
  ctwaClid?: string;
  source_type?: string;
  source_id?: string;
  headline?: string;
  click_timestamp?: string | number;
}

export function readMetaReferral(
  message: { referral?: MetaReferral; context?: { referral?: MetaReferral } } | null,
): Referral | null {
  const ref = message?.referral ?? message?.context?.referral ?? null;
  if (!ref) return null;
  return {
    ctwaClid: ref.ctwa_clid ?? ref.ctwaClid ?? null,
    adId: ref.source_type === "ad" ? (ref.source_id ?? null) : null,
    sourceType: ref.source_type ?? null,
    headline: ref.headline ?? null,
    clickTs: ref.click_timestamp ? Number(ref.click_timestamp) : null,
  };
}

// Meta Cloud API message; only the fields read below.
export interface MetaMessage {
  type?: string;
  from?: string;
  id?: string;
  timestamp?: string | number;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { list_reply?: { title?: string } };
  referral?: MetaReferral;
  context?: { referral?: MetaReferral };
}

export function parseMetaMessage(message: MetaMessage): InboundMessage {
  const text =
    message.type === "text"
      ? message.text?.body || ""
      : message.button?.text || message.interactive?.list_reply?.title || `[${message.type}]`;
  return {
    jid: String(message.from),
    text,
    ts: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    externalId: message.id ?? null,
    fromMe: false,
    referral: readMetaReferral(message),
  };
}

// Evolution API (QR / linked device) events
// Evolution API webhook body; only the fields read below.
interface EvolutionKey {
  remoteJid?: string;
  remoteJidAlt?: string;
  senderPn?: string;
  id?: string;
  fromMe?: boolean;
}
export interface EvolutionItem {
  key?: EvolutionKey;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    buttonsResponseMessage?: { selectedDisplayText?: string };
    listResponseMessage?: { title?: string };
  };
  messageType?: string;
  messageTimestamp?: string | number;
}
export interface EvolutionBody {
  instance?: unknown;
  event?: unknown;
  data?: unknown;
}

// One messages.upsert item; null for groups, broadcasts, status, or unresolved lid.
export function parseEvolutionItem(d: EvolutionItem | undefined): InboundMessage | null {
  const key: EvolutionKey = d?.key || {};
  // Prefer the real phone JID when WhatsApp hides it behind a @lid id
  const jid: string =
    [key.remoteJid, key.remoteJidAlt, key.senderPn].find(
      (j) => typeof j === "string" && j.endsWith("@s.whatsapp.net"),
    ) || "";
  if (!jid || !d) return null;

  const msg = d.message || {};
  const text: string =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    `[${d.messageType || "message"}]`;

  const ad = parseAdContext(msg) ?? parseAdContext(d);
  const ts = Number(d.messageTimestamp);
  return {
    jid,
    text,
    ts: ts ? new Date(ts * 1000) : new Date(),
    externalId: key.id ?? null,
    fromMe: Boolean(key.fromMe),
    referral: ad
      ? { ctwaClid: ad.ctwaClid, adId: ad.adId, sourceType: "ad", headline: ad.headline, clickTs: null }
      : null,
  };
}

// Green-API (QR / linked device) notifications
// Green-API notification body; only the fields read below.
export interface GreenBody {
  instanceData?: { idInstance?: string | number };
  typeWebhook?: string;
  stateInstance?: string;
  senderData?: { chatId?: string };
  messageData?: {
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
    fileMessageData?: { caption?: string };
    typeMessage?: string;
  };
  timestamp?: string | number;
  idMessage?: string;
}

// An incoming/outgoing chat message; null for other notifications, groups, broadcasts, status.
export function parseGreenMessage(body: GreenBody): InboundMessage | null {
  const fromMe = body.typeWebhook === "outgoingMessageReceived";
  if (body.typeWebhook !== "incomingMessageReceived" && !fromMe) return null;

  const chatId: string = body.senderData?.chatId || "";
  if (!chatId.endsWith("@c.us")) return null; // ignore groups, broadcasts, status

  const md = body.messageData || {};
  const text: string =
    md.textMessageData?.textMessage ??
    md.extendedTextMessageData?.text ??
    md.fileMessageData?.caption ??
    `[${md.typeMessage || "message"}]`;

  return {
    jid: chatId,
    text,
    ts: body.timestamp ? new Date(Number(body.timestamp) * 1000) : new Date(),
    externalId: body.idMessage ?? null,
    fromMe,
    referral: null,
  };
}
