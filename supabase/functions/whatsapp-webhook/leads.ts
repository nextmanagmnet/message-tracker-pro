import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scoreLead } from "../_shared/scoring.ts";
import { decodeRef, extractCampaignCode, extractClidFromText, extractFbclid } from "../_shared/funnel.ts";
import type { WaMessage } from "./parse.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

async function resolveMetaCampaign(supabase: SupabaseClient, clientId: string, adId: string): Promise<string | null> {
  // Optional read-only token; without it the lead still counts, just without a campaign id.
  const { data: acct } = await supabase
    .from("meta_accounts")
    .select("ads_token")
    .eq("client_id", clientId)
    .not("ads_token", "is", null)
    .maybeSingle();
  if (!acct?.ads_token) return null;
  try {
    const r = await fetch(`${GRAPH}/${adId}?fields=campaign_id&access_token=${encodeURIComponent(acct.ads_token)}`);
    const d = await r.json();
    return d?.campaign_id ?? null;
  } catch {
    return null;
  }
}

// First message from a new sender: score it, attribute it to an ad/campaign, and insert the lead.
export async function createLead(
  supabase: SupabaseClient,
  m: WaMessage,
  phoneHash: string,
): Promise<{ id: string; isReal: boolean } | null> {
  // Clicks through WOB's /go bridge carry a hidden ad_clicks id; older links put ttclid=/cid= in the text.
  const ref = decodeRef(m.text);
  const click = ref
    ? (await supabase.from("ad_clicks").select("ttclid, campaign_id").eq("id", ref).maybeSingle()).data
    : null;
  const textClid = click?.ttclid ?? extractClidFromText(m.text);
  const fbclid = extractFbclid(m.text);
  const isMeta = Boolean(m.referral);
  const ctwaClid = m.referral?.ctwaClid ?? null;
  const attributionSource = m.referral?.ctwaClid
    ? "referral"
    : m.referral
      ? "referral_partial"
      : textClid || fbclid
        ? "message_text"
        : "none";
  const clientId = m.num.client_id;

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [velocityRes, senderRes, dupRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", tenMinAgo),
    supabase.from("leads").select("source_id, ctwa_clid").eq("sender_phone_hash", phoneHash).limit(50),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("first_message", m.text),
  ]);
  const senderLeads = senderRes.data ?? [];
  const distinctSources = new Set(senderLeads.map((l: { source_id: string | null }) => l.source_id).filter(Boolean))
    .size;
  const clickToMessageSeconds = m.referral?.clickTs
    ? Math.max(0, Math.round((m.ts.getTime() - m.referral.clickTs * 1000) / 1000))
    : null;

  const scored = scoreLead({
    message: m.text,
    hasReferral: isMeta,
    ctwaClid: ctwaClid ?? textClid ?? fbclid,
    clickToMessageSeconds,
    clientVelocity10m: velocityRes.count ?? 0,
    senderLeadCount: senderLeads.length,
    senderDistinctSources: distinctSources,
    duplicateMessageText: (dupRes.count ?? 0) > 0,
  });

  const campaignId =
    isMeta && m.referral?.adId
      ? await resolveMetaCampaign(supabase, clientId, m.referral.adId)
      : (click?.campaign_id ?? extractCampaignCode(m.text));
  // No click id, but a cid= matching one of this client's TikTok campaigns still ties the chat to that campaign.
  const knownTikTokCampaign =
    !isMeta && !textClid && !fbclid && campaignId
      ? !!(
          await supabase
            .from("tiktok_campaigns")
            .select("id")
            .eq("client_id", clientId)
            .eq("campaign_id", campaignId)
            .limit(1)
            .maybeSingle()
        ).data
      : false;
  const adPlatform = isMeta ? "meta" : textClid || knownTikTokCampaign ? "tiktok" : fbclid ? "meta" : null;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      client_id: clientId,
      tenant_id: m.num.tenant_id,
      whatsapp_number_id: m.num.id,
      sender_phone_hash: phoneHash,
      ttclid: textClid,
      fbclid,
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
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error inserting lead:", error);
    return null;
  }
  console.log(
    `Lead ${lead.id} client=${clientId} score=${scored.score} status=${scored.status} attribution=${attributionSource}`,
  );
  return { id: lead.id, isReal: scored.isReal };
}
