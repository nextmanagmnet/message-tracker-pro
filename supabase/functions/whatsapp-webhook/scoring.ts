// Lead quality / fraud scoring for inbound WhatsApp conversations.
// Produces a 0-100 quality score plus the individual signals behind it.

export interface ScoringInput {
  message: string;
  hasReferral: boolean;
  ctwaClid: string | null;
  clickToMessageSeconds: number | null;
  // number of leads created for this client in the last 10 minutes
  clientVelocity10m: number;
  // number of messages from this same phone hash across ALL clients
  senderLeadCount: number;
  // distinct campaigns/ads this same phone hash already came through
  senderDistinctSources: number;
  // true when the exact same first message text was already seen for this client
  duplicateMessageText: boolean;
}

export interface ScoringResult {
  score: number;
  isReal: boolean;
  status: "verified" | "pending" | "trash";
  signals: Record<string, unknown>;
}

const EMOJI_ONLY =
  /^[\p{Extended_Pictographic}\p{Emoji_Component}\s\u{2600}-\u{27BF}]+$/u;

const LOW_INTENT = [
  /^(hi|hello|hey|ola|hola|ok|okay|yes|no|sure|thanks|thank you|salam|مرحبا|السلام عليكم)[!.?\s]*$/i,
  /^\d+$/,
  /^[!?.,\-_*]+$/,
];

const INTENT_WORDS = [
  "price", "cost", "how much", "available", "book", "booking", "appointment",
  "order", "buy", "delivery", "interested", "quote", "need", "want", "when",
  "where", "size", "color", "stock", "info", "details", "سعر", "كم", "حجز",
  "متوفر", "توصيل", "اريد", "أريد", "معلومات",
];

export function scoreLead(input: ScoringInput): ScoringResult {
  const text = (input.message || "").trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 2);

  const signals: Record<string, unknown> = {};
  let score = 50; // neutral baseline

  // --- Content signals -------------------------------------------------
  const emojiOnly = text.length > 0 && EMOJI_ONLY.test(text);
  const tooShort = text.length <= 6;
  const lowIntent = LOW_INTENT.some((p) => p.test(text));
  const hasIntentWord = INTENT_WORDS.some((w) => lower.includes(w));
  const hasQuestion = /\?|\u061F/.test(text);

  if (emojiOnly) score -= 40;
  if (tooShort) score -= 25;
  if (lowIntent) score -= 30;
  if (words.length >= 2) score += 10;
  if (words.length >= 5) score += 5;
  if (hasIntentWord) score += 20;
  if (hasQuestion) score += 5;

  signals.content = {
    length: text.length,
    words: words.length,
    emoji_only: emojiOnly,
    too_short: tooShort,
    low_intent_phrase: lowIntent,
    has_intent_keyword: hasIntentWord,
    has_question: hasQuestion,
  };

  // --- Attribution signals ---------------------------------------------
  if (input.hasReferral && input.ctwaClid) score += 25;
  else if (input.hasReferral) score += 10;
  else score -= 10; // organic / unattributable traffic

  signals.attribution = {
    has_referral: input.hasReferral,
    has_ctwa_clid: Boolean(input.ctwaClid),
  };

  // --- Timing signals ---------------------------------------------------
  const gap = input.clickToMessageSeconds;
  if (gap !== null) {
    if (gap < 2) score -= 30; // impossibly fast: automation
    else if (gap < 5) score -= 10;
    else if (gap <= 900) score += 10; // human-plausible window
    else if (gap > 86400) score -= 5; // very stale click
  }
  signals.timing = { click_to_message_seconds: gap };

  // --- Velocity / repeat signals ---------------------------------------
  if (input.clientVelocity10m > 30) score -= 30;
  else if (input.clientVelocity10m > 15) score -= 15;

  if (input.senderLeadCount >= 5) score -= 25;
  else if (input.senderLeadCount >= 2) score -= 10;

  if (input.senderDistinctSources >= 3) score -= 15;
  if (input.duplicateMessageText) score -= 20;

  signals.behaviour = {
    client_velocity_10m: input.clientVelocity10m,
    sender_lead_count: input.senderLeadCount,
    sender_distinct_sources: input.senderDistinctSources,
    duplicate_message_text: input.duplicateMessageText,
  };

  score = Math.max(0, Math.min(100, Math.round(score)));

  // A lead is REAL (and therefore worth sending to TikTok) only when the
  // score clears the bar and the content is not obviously junk.
  const isReal = score >= 60 && !emojiOnly && !tooShort && !lowIntent;
  const status: ScoringResult["status"] = isReal
    ? "verified"
    : score < 35
    ? "trash"
    : "pending";

  return { score, isReal, status, signals };
}
