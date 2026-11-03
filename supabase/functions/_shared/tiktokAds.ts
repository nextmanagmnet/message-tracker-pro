// Pure request builders and validation for the AI campaign launcher (tiktok-ads). No Deno APIs, so Vitest
// covers them. The shapes follow what was proven live on a TikTok lead-generation account: website
// conversions optimized for the pixel's FORM (SubmitForm) event, landing on WOB's /go WhatsApp bridge.

export const MIN_DAILY_BUDGET = 20; // TikTok's minimum ad-group daily budget (USD accounts)
export const MAX_DAILY_BUDGET = 500; // WOB's safety cap; LAUNCH_MAX_DAILY_BUDGET raises it server-side
export const MAX_AD_TEXT = 100;
export const MAX_ADS = 20; // TikTok's per-ad-group limit
export const CTAS = [
  "CONTACT_US",
  "LEARN_MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "BOOK_NOW",
  "GET_QUOTE",
  "SIGN_UP",
  "APPLY_NOW",
] as const;
export const GENDERS = ["GENDER_UNLIMITED", "GENDER_MALE", "GENDER_FEMALE"] as const;
// TikTok's age buckets. 13-17 is never targeted: these ads collect contact details.
const AGE_BUCKETS = [
  { id: "AGE_18_24", min: 18, max: 24 },
  { id: "AGE_25_34", min: 25, max: 34 },
  { id: "AGE_35_44", min: 35, max: 44 },
  { id: "AGE_45_54", min: 45, max: 54 },
  { id: "AGE_55_100", min: 55, max: 100 },
];

export type Cta = (typeof CTAS)[number];
export type Gender = (typeof GENDERS)[number];

// One ad's media: an ad-library video with its cover image, or an existing TikTok post (Spark).
export interface Creative {
  videoId?: string;
  imageIds?: string[];
  tiktokItemId?: string;
}

export interface Identity {
  id: string;
  type: string;
  bcId?: string | null;
}

export interface LaunchInput {
  launchId: string;
  name: string;
  locationIds: string[];
  ageMin: number;
  ageMax: number;
  gender: Gender;
  dailyBudget: number;
  startAt: string | null; // ISO; null or past = now
  whatsappNumberId: string;
  message: string;
  cta: Cta;
  mediaIds: string[]; // ad_media rows (or "spark:<item id>")
  texts: string[];
  identity: Identity;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

// Age range → TikTok buckets that overlap it (TikTok has no free-form ages).
export function ageGroups(min: number, max: number): string[] {
  return AGE_BUCKETS.filter((b) => b.max >= min && b.min <= max).map((b) => b.id);
}

/** Validates the wizard's launch request. maxBudget is the server-side cap. */
export function validateLaunch(raw: unknown, maxBudget = MAX_DAILY_BUDGET): Result<LaunchInput> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const launchId = str(b.launchId);
  if (!UUID.test(launchId)) return { ok: false, error: "launchId must be a UUID" };
  const name = str(b.name).slice(0, 100);
  if (!name) return { ok: false, error: "Campaign name is required" };
  const locationIds = strList(b.locationIds).filter((id) => /^\d{1,20}$/.test(id));
  if (!locationIds.length) return { ok: false, error: "Choose at least one location" };
  const ageMin = Number(b.ageMin ?? 18);
  const ageMax = Number(b.ageMax ?? 100);
  if (!(ageMin >= 18 && ageMax <= 100 && ageMin <= ageMax)) return { ok: false, error: "Age must be 18 or older" };
  const gender = (GENDERS as readonly string[]).includes(str(b.gender)) ? (str(b.gender) as Gender) : null;
  if (!gender) return { ok: false, error: "Invalid gender" };
  const dailyBudget = Number(b.dailyBudget);
  if (!Number.isFinite(dailyBudget) || dailyBudget < MIN_DAILY_BUDGET)
    return { ok: false, error: `Daily budget must be at least ${MIN_DAILY_BUDGET}` };
  if (dailyBudget > maxBudget) return { ok: false, error: `Daily budget is capped at ${maxBudget}` };
  const startAt = str(b.startAt) || null;
  if (startAt && Number.isNaN(Date.parse(startAt))) return { ok: false, error: "Invalid start time" };
  const whatsappNumberId = str(b.whatsappNumberId);
  if (!UUID.test(whatsappNumberId)) return { ok: false, error: "Choose a WhatsApp number" };
  const message = str(b.message).slice(0, 300);
  if (!message) return { ok: false, error: "The WhatsApp message is required" };
  const cta = (CTAS as readonly string[]).includes(str(b.cta)) ? (str(b.cta) as Cta) : null;
  if (!cta) return { ok: false, error: "Invalid call to action" };
  const mediaIds = [...new Set(strList(b.mediaIds))];
  if (!mediaIds.length) return { ok: false, error: "Add at least one video or image" };
  const texts = [...new Set(strList(b.texts))];
  if (!texts.length) return { ok: false, error: "Add at least one ad text" };
  if (texts.some((t) => t.length > MAX_AD_TEXT))
    return { ok: false, error: `Ad texts must be ${MAX_AD_TEXT} characters or less` };
  if (mediaIds.length * texts.length > MAX_ADS) return { ok: false, error: `At most ${MAX_ADS} ads per launch` };
  const id = (b.identity ?? {}) as Record<string, unknown>;
  const identity = { id: str(id.id), type: str(id.type), bcId: str(id.bcId) || null };
  if (!identity.id || !identity.type) return { ok: false, error: "Choose the TikTok account the ads run from" };
  return {
    ok: true,
    value: {
      launchId,
      name,
      locationIds,
      ageMin,
      ageMax,
      gender,
      dailyBudget,
      startAt,
      whatsappNumberId,
      message,
      cta,
      mediaIds,
      texts,
      identity,
    },
  };
}

// TikTok wants "YYYY-MM-DD HH:MM:SS" in UTC; a past or missing start means now (+2 min of slack).
export function scheduleTime(startAt: string | null, now: Date): string {
  const at = startAt ? new Date(startAt) : now;
  const t = at.getTime() < now.getTime() + 120_000 ? new Date(now.getTime() + 120_000) : at;
  return t.toISOString().slice(0, 19).replace("T", " ");
}

// WOB's /go bridge (api/go.js). TikTok fills __CAMPAIGN_ID__ and appends ttclid. Same shape as src/lib/goLink.ts.
export function goLink(origin: string, phone: string, text: string, pixelCode?: string | null): string {
  const to = phone.replace(/\D/g, "");
  const q = new URLSearchParams({ to, text, ...(pixelCode ? { px: pixelCode } : {}) });
  return `${origin.replace(/\/$/, "")}/go?${q}&cid=__CAMPAIGN_ID__`;
}

const status = (enabled: boolean) => (enabled ? "ENABLE" : "DISABLE");

export function campaignBody(advertiserId: string, name: string, enabled: boolean) {
  return {
    advertiser_id: advertiserId,
    campaign_name: name,
    objective_type: "LEAD_GENERATION",
    budget_mode: "BUDGET_MODE_INFINITE",
    operation_status: status(enabled),
  };
}

export function adGroupBody(
  advertiserId: string,
  campaignId: string,
  input: LaunchInput,
  pixelId: string,
  enabled: boolean,
  now: Date,
) {
  return {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    adgroup_name: input.name,
    promotion_type: "LEAD_GENERATION",
    promotion_target_type: "EXTERNAL_WEBSITE",
    optimization_goal: "CONVERT",
    pixel_id: pixelId,
    optimization_event: "FORM",
    billing_event: "OCPM",
    bid_type: "BID_TYPE_NO_BID",
    pacing: "PACING_MODE_SMOOTH", // TikTok rejects the default (accelerated) with no-bid on this objective
    placement_type: "PLACEMENT_TYPE_NORMAL",
    placements: ["PLACEMENT_TIKTOK"],
    location_ids: input.locationIds,
    age_groups: ageGroups(input.ageMin, input.ageMax),
    gender: input.gender,
    budget_mode: "BUDGET_MODE_DAY",
    budget: input.dailyBudget,
    schedule_type: "SCHEDULE_FROM_NOW",
    schedule_start_time: scheduleTime(input.startAt, now),
    operation_status: status(enabled),
  };
}

// One ad per creative × text, named so the user can tell them apart in TikTok Ads Manager.
export function adBody(
  advertiserId: string,
  adgroupId: string,
  opts: {
    name: string;
    creatives: Creative[];
    texts: string[];
    identity: Identity;
    landingUrl: string;
    pixelId: string;
    cta: string;
    enabled: boolean;
  },
) {
  const ads = opts.creatives.flatMap((c, ci) =>
    opts.texts.map((text, ti) => ({
      ad_name: `${opts.name} - ${ci + 1}.${ti + 1}`.slice(0, 512),
      ad_format: "SINGLE_VIDEO", // the TikTok placement only runs video (images serve as the cover)
      ...(c.tiktokItemId ? { tiktok_item_id: c.tiktokItemId } : { video_id: c.videoId, image_ids: c.imageIds ?? [] }),
      ad_text: text,
      call_to_action: opts.cta,
      landing_page_url: opts.landingUrl,
      identity_type: opts.identity.type,
      identity_id: opts.identity.id,
      ...(opts.identity.bcId ? { identity_authorized_bc_id: opts.identity.bcId } : {}),
      tracking_pixel_id: opts.pixelId, // a string: pixel ids exceed Number's safe-integer range
      operation_status: status(opts.enabled), // per creative: TikTok ignores a top-level one here
    })),
  );
  return { advertiser_id: advertiserId, adgroup_id: adgroupId, creatives: ads };
}

// TikTok's 40001 ("advertiser does not grant you ... permission") means the stored token lacks a scope.
export const isScopeError = (code: number | undefined) => code === 40001;

export interface Suggestion {
  texts: string[];
  message: string;
  countryCode: string | null;
  ageMin: number;
  ageMax: number;
  gender: Gender;
}

export const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    texts: { type: "array", items: { type: "string" } },
    message: { type: "string" },
    country_code: { type: "string" },
    age_min: { type: "integer" },
    age_max: { type: "integer" },
    gender: { type: "string", enum: [...GENDERS] },
  },
  required: ["texts", "message", "country_code", "age_min", "age_max", "gender"],
  additionalProperties: false,
};

/** Parses and clamps the model's suggestion; null when nothing usable came back. */
export function parseSuggestion(raw: string | null): Suggestion | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw ?? "");
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const texts = strList(d.texts)
    .filter((t) => t.length <= MAX_AD_TEXT)
    .slice(0, 3);
  const message = str(d.message).slice(0, 300);
  if (!texts.length || !message) return null;
  const code = str(d.country_code).toUpperCase();
  const lo = Math.max(18, Math.min(100, Math.round(Number(d.age_min)) || 18));
  const hi = Math.max(lo, Math.min(100, Math.round(Number(d.age_max)) || 100));
  return {
    texts,
    message,
    countryCode: /^[A-Z]{2}$/.test(code) ? code : null,
    ageMin: lo,
    ageMax: hi,
    gender: (GENDERS as readonly string[]).includes(str(d.gender)) ? (str(d.gender) as Gender) : "GENDER_UNLIMITED",
  };
}

export interface AdReview {
  adId: string;
  name: string | null;
  status: string | null; // TikTok secondary_status, e.g. AD_STATUS_DELIVERY_OK, AD_STATUS_NOT_PASS
  approved: boolean | null;
  reasons: string[];
}

// Joins ad/get rows with ad/review_info's map into one review line per ad.
export function reviewSummary(ads: unknown[], reviewMap: Record<string, unknown>): AdReview[] {
  return ads.map((a) => {
    const ad = (a ?? {}) as Record<string, unknown>;
    const id = String(ad.ad_id ?? "");
    const r = (reviewMap[id] ?? {}) as Record<string, unknown>;
    const reasons = (Array.isArray(r.reject_info) ? r.reject_info : []).flatMap((x) => {
      const info = (x ?? {}) as Record<string, unknown>;
      return [str(info.reason), str(info.suggestion)].filter(Boolean);
    });
    return {
      adId: id,
      name: typeof ad.ad_name === "string" ? ad.ad_name : null,
      status: typeof ad.secondary_status === "string" ? ad.secondary_status : null,
      approved: typeof r.is_approved === "boolean" ? r.is_approved : null,
      reasons,
    };
  });
}
