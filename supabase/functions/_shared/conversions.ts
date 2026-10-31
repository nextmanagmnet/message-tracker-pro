import {
  buildMetaPayload,
  buildTikTokPayload,
  canAdvance,
  eventIdFor,
  eventNameFor,
  stagesPassed,
  type Platform,
  type Stage,
} from "./funnel.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
const LEAD_COLS =
  "id, client_id, stage, ad_platform, ttclid, ctwa_clid, fbclid, message_received_at, sender_phone_hash, order_value, order_currency";

// "chat" is accurate for WhatsApp conversations and needs no page URL. "website" would also
// require event_source_url + client_user_agent, so only set META_ACTION_SOURCE to chat,
// system_generated or other.
export const metaActionSource = () => Deno.env.get("META_ACTION_SOURCE") || "chat";

// The page TikTok events name: WOB's WhatsApp bridge, i.e. the site the ad actually linked to.
const bridgeUrl = () => `${(Deno.env.get("APP_ORIGINS") ?? "https://wob-platform.vercel.app").split(",")[0].trim()}/go.html`;

// POSTs events to a client's pixel with the token they pasted.
export async function postMetaEvents(pixelId: string, token: string, payload: unknown) {
  const res = await fetch(`${GRAPH}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  return { ok: res.ok && !result?.error, result };
}

function platformsFor(lead: any): Platform[] {
  if (lead.ad_platform === "meta" || lead.ad_platform === "tiktok") return [lead.ad_platform];
  return lead.ttclid ? ["tiktok"] : lead.fbclid ? ["meta"] : [];
}

/**
 * Moves a lead forward in the funnel and reports the new stage to the ad
 * platform it came from. Safe to call repeatedly: stages never go backwards
 * and each (lead, stage, platform) event is sent at most once.
 */
export async function reportStage(
  supabase: any,
  leadId: string,
  stage: Stage,
  opts: { value?: number | null; currency?: string | null } = {},
): Promise<{ changed: boolean }> {
  const { data: lead } = await supabase.from("leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  if (!lead || !canAdvance(lead.stage, stage)) return { changed: false };
  const passed = stagesPassed(lead.stage, stage);

  const patch: Record<string, unknown> = { stage, stage_updated_at: new Date().toISOString() };
  if (stage === "not_lead") Object.assign(patch, { status: "trash", is_real: false });
  else Object.assign(patch, { status: "verified", is_real: true, stage_suggestion: null });
  if (stage === "client") {
    patch.order_value = opts.value ?? lead.order_value ?? null;
    patch.order_currency = opts.currency ?? lead.order_currency ?? null;
  }
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) {
    console.error("reportStage update failed", error);
    return { changed: false };
  }
  if (stage === "not_lead") return { changed: true };

  for (const platform of platformsFor(lead)) {
    for (const s of passed) {
      const eventName = eventNameFor(platform, s);
      if (!eventName) continue;
      const { data: ev, error: insErr } = await supabase
        .from("conversion_events")
        .insert({
          client_id: lead.client_id,
          lead_id: leadId,
          platform,
          event_name: eventName,
          stage: s,
          value: s === "client" ? patch.order_value : null,
          currency: s === "client" ? patch.order_currency : null,
          event_id: eventIdFor(leadId, s, platform),
          status: "pending",
          attempts: 0,
        })
        .select("*")
        .single();
      if (insErr) {
        if (insErr.code !== "23505") console.error("conversion_events insert failed", insErr); // 23505 = already sent
        continue;
      }
      await sendConversionEvent(supabase, ev, lead);
    }
  }
  return { changed: true };
}

// TikTok matches on SHA-256 of the E.164 number ("+9665..."); leads only store a
// digits-only hash (Meta's format), so rebuild it from the stored WhatsApp contact.
async function tiktokPhoneHash(supabase: any, leadId: string): Promise<string | null> {
  const { data: conv } = await supabase.from("conversations").select("id").eq("lead_id", leadId).maybeSingle();
  if (!conv) return null;
  const { data: contact } = await supabase
    .from("conversation_contacts").select("contact_jid").eq("conversation_id", conv.id).maybeSingle();
  const digits = String(contact?.contact_jid ?? "").split("@")[0].replace(/\D/g, "");
  if (!digits) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`+${digits}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Sends (or re-sends) one conversion_events row and records the outcome.
export async function sendConversionEvent(supabase: any, ev: any, lead?: any) {
  lead ??= (await supabase.from("leads").select(LEAD_COLS).eq("id", ev.lead_id).maybeSingle()).data;
  const finish = (status: string, response: unknown) =>
    supabase.from("conversion_events").update({
      status,
      response,
      attempts: (ev.attempts ?? 0) + (status === "skipped" ? 0 : 1),
      sent_at: status === "sent" ? new Date().toISOString() : null,
    }).eq("id", ev.id);

  if (!lead) return finish("skipped", { reason: "lead_missing" });
  const input = {
    eventName: ev.event_name,
    eventId: ev.event_id,
    eventTime: Math.floor(Date.now() / 1000),
    phoneHash: lead.sender_phone_hash,
    value: ev.value,
    currency: ev.currency,
  };

  try {
    if (ev.platform === "tiktok") {
      if (!lead.ttclid) return finish("skipped", { reason: "no_click_id" });
      const [{ data: acct }, { data: pixel }] = await Promise.all([
        supabase.from("tiktok_accounts").select("access_token").eq("client_id", ev.client_id).limit(1).maybeSingle(),
        supabase.from("tiktok_pixels").select("pixel_code").eq("client_id", ev.client_id).limit(1).maybeSingle(),
      ]);
      if (!acct?.access_token || !pixel?.pixel_code) return finish("skipped", { reason: !acct ? "no_tiktok_account" : "no_pixel" });
      const phoneHash = (await tiktokPhoneHash(supabase, lead.id)) ?? input.phoneHash;
      const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
        method: "POST",
        headers: { "Access-Token": acct.access_token, "Content-Type": "application/json" },
        body: JSON.stringify(buildTikTokPayload(pixel.pixel_code, { ...input, phoneHash, clickId: lead.ttclid, pageUrl: bridgeUrl() })),
      });
      const result = await res.json().catch(() => ({}));
      return finish(result?.code === 0 ? "sent" : "failed", { code: result?.code, message: result?.message });
    }

    const { data: meta } = await supabase
      .from("meta_accounts")
      .select("capi_token, dataset_id")
      .eq("client_id", ev.client_id)
      .maybeSingle();
    if (!meta?.capi_token || !meta?.dataset_id) return finish("skipped", { reason: "no_meta_pixel" });
    // Phone match works for any Meta-sourced lead; fbc is added when the chat carried an fbclid.
    const { ok, result } = await postMetaEvents(
      meta.dataset_id,
      meta.capi_token,
      buildMetaPayload({
        eventName: input.eventName,
        eventId: input.eventId,
        eventTime: input.eventTime,
        phoneHash: input.phoneHash,
        value: input.value,
        currency: input.currency,
        fbclid: lead.fbclid,
        fbclidAtMs: lead.message_received_at ? Date.parse(lead.message_received_at) : null,
        actionSource: metaActionSource(),
      }),
    );
    return finish(ok ? "sent" : "failed", result?.error ?? { events_received: result?.events_received });
  } catch (e) {
    return finish("failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
