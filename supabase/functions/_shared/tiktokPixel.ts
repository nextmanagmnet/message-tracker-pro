import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Automatic TikTok pixel setup: reuse the ad account's pixel (or create one) and register the three
// events WOB reports from the server, so users never paste a pixel code or open Events Manager.

const TT = "https://business-api.tiktok.com/open_api/v1.3";

// event_type is TikTok's internal type; event_name is what WOB's server sends (see funnel.ts EVENTS).
export const WOB_PIXEL_EVENTS = [
  { event_type: "CONSULT", event_name: "Contact" },
  { event_type: "FORM", event_name: "SubmitForm" },
  { event_type: "SHOPPING", event_name: "Purchase" },
] as const;

export const missingEvents = (existing: Array<{ event_type?: string }>) =>
  WOB_PIXEL_EVENTS.filter((e) => !existing.some((x) => x.event_type === e.event_type));

// A pixel as pixel/list/ returns it.
export interface TikTokPixel {
  pixel_id: string;
  pixel_code: string;
  pixel_name?: string | null;
  events?: Array<{ event_type?: string }>;
}

// Keep the pixel the client already chose; otherwise the first one on the account.
export const pickPixel = (list: TikTokPixel[], saved: string | null) =>
  list.find((p) => p.pixel_code === saved) ?? list[0] ?? null;

// TikTok: at most 40 characters, no emojis, unique per advertiser.
export const pixelName = (clientName: string) =>
  `WOB ${clientName}`.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 40) || "WOB pixel";

async function tt(path: string, token: string, body?: unknown, params?: Record<string, string>) {
  const url = `${TT}/${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Access-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({ code: -1, message: `Unreadable response (${res.status})` }));
  if (json.code !== 0) throw new Error(`${path}: ${json.message ?? json.code}`);
  return json.data ?? {};
}

export interface PixelSetup {
  pixelCode: string;
  pixelName: string | null;
  created: boolean;
  eventsAdded: string[];
}

/** Idempotent: safe to run on every connect and on demand. Throws with TikTok's message on failure. */
export async function ensurePixel(supabase: SupabaseClient, clientId: string): Promise<PixelSetup> {
  const [{ data: account }, { data: saved }, { data: client }] = await Promise.all([
    supabase.from("tiktok_accounts").select("advertiser_id, access_token").eq("client_id", clientId).limit(1).maybeSingle(),
    supabase.from("tiktok_pixels").select("id, pixel_code").eq("client_id", clientId).limit(1).maybeSingle(),
    supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
  ]);
  if (!account?.access_token) throw new Error("Connect a TikTok ad account first");
  const base = { advertiser_id: account.advertiser_id };
  const listPixels = async (): Promise<TikTokPixel[]> => (await tt("pixel/list/", account.access_token, undefined, { ...base, page_size: "20" })).pixels ?? [];

  let pixel = pickPixel(await listPixels(), saved?.pixel_code ?? null);
  let created = false;
  if (!pixel) {
    await tt("pixel/create/", account.access_token, { ...base, pixel_name: pixelName(client?.name ?? "") });
    created = true;
    pixel = pickPixel(await listPixels(), null);
    if (!pixel) throw new Error("TikTok created the pixel but did not list it yet; try again in a minute");
  }

  const toAdd = missingEvents(pixel.events ?? []);
  if (toAdd.length) {
    await tt("pixel/event/create/", account.access_token, { ...base, pixel_id: pixel.pixel_id, pixel_events: toAdd });
  }

  if (saved?.id) {
    if (saved.pixel_code !== pixel.pixel_code) await supabase.from("tiktok_pixels").update({ pixel_code: pixel.pixel_code }).eq("id", saved.id);
  } else {
    await supabase.from("tiktok_pixels").insert({ client_id: clientId, pixel_code: pixel.pixel_code });
  }
  return { pixelCode: pixel.pixel_code, pixelName: pixel.pixel_name ?? null, created, eventsAdded: toAdd.map((e) => e.event_name) };
}
