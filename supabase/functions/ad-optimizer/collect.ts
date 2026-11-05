import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  emptyMetrics,
  funnelBy,
  parseReport,
  ruleHits,
  summarize,
  type Entity,
  type Funnel,
  type Hit,
  type Summary,
} from "../_shared/optimizer.ts";
import { tiktokApi } from "../_shared/tiktokApi.ts";

// Read-only: pulls the account's structure, reports and WOB funnel, and runs the rules. Writes nothing.

export type Account = { client_id: string; advertiser_id: string; access_token: string };

const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().split("T")[0];

export async function getAccount(supabase: SupabaseClient, clientId: string): Promise<Account | null> {
  const { data } = await supabase
    .from("tiktok_accounts")
    .select("client_id, advertiser_id, access_token")
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();
  return data;
}

type Row = Record<string, unknown> & { operation_status?: string };

export async function list(path: string, acc: Account, fields: string[], filtering?: Record<string, unknown>) {
  const params: Record<string, string> = {
    advertiser_id: acc.advertiser_id,
    page_size: "1000",
    fields: JSON.stringify(fields),
  };
  if (filtering) params.filtering = JSON.stringify(filtering);
  // ponytail: first page only (1000 objects); paginate if an account ever has more.
  const data = await tiktokApi<{ list?: Row[] }>(path, acc.access_token, { params });
  return data.list ?? [];
}

// report/integrated/get is GET-only; arrays go JSON-encoded in the query.
async function report(acc: Account, level: "ADGROUP" | "AD", start: string, end: string) {
  const idKey = `${level.toLowerCase()}_id`;
  const data = await tiktokApi<{ list?: unknown }>("report/integrated/get/", acc.access_token, {
    params: {
      advertiser_id: acc.advertiser_id,
      report_type: "BASIC",
      data_level: `AUCTION_${level}`,
      dimensions: JSON.stringify([idKey]),
      metrics: JSON.stringify(["spend", "clicks", "impressions", "conversion", "complete_payment"]),
      start_date: start,
      end_date: end,
      page_size: "1000",
    },
  });
  return parseReport(data.list, idKey);
}

const sumFunnels = (fs: Funnel[]): Funnel | null =>
  fs.length === 0
    ? null
    : fs.reduce((a, f) => ({
        chats: a.chats + f.chats,
        real: a.real + f.real,
        qualified: a.qualified + f.qualified,
        clients: a.clients + f.clients,
        revenue: a.revenue + f.revenue,
      }));

export async function findHits(
  supabase: SupabaseClient,
  acc: Account,
  clientId: string,
): Promise<{ hits: Hit[]; summary: Summary }> {
  // Last 7 full-ish days (today included) and the 7 before, for week-over-week change.
  const [l7, p7] = [
    [day(6), day(0)],
    [day(13), day(7)],
  ] as const;
  const [campaigns, adgroups, ads, ...reports] = await Promise.all([
    list("campaign/get/", acc, ["campaign_id", "campaign_name", "operation_status"]),
    list("adgroup/get/", acc, [
      "adgroup_id",
      "adgroup_name",
      "campaign_id",
      "operation_status",
      "budget",
      "budget_mode",
      "optimization_event",
    ]),
    list("ad/get/", acc, ["ad_id", "ad_name", "adgroup_id", "campaign_id", "operation_status"]),
    report(acc, "ADGROUP", ...l7),
    report(acc, "ADGROUP", ...p7),
    report(acc, "AD", ...l7),
    report(acc, "AD", ...p7),
  ]);
  const [g7, gPrev, a7, aPrev] = reports;

  const { data: leads } = await supabase
    .from("leads")
    .select("campaign_id, ad_id, stage, order_value")
    .eq("client_id", clientId)
    .eq("ad_platform", "tiktok")
    .gte("created_at", `${l7[0]}T00:00:00Z`);
  const byCampaign = funnelBy(leads ?? [], "campaign_id");
  const byAd = funnelBy(leads ?? [], "ad_id");

  const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
  const campaignOn = new Map(campaigns.map((c) => [str(c.campaign_id), c.operation_status === "ENABLE"]));
  const campaignName = new Map(campaigns.map((c) => [str(c.campaign_id), str(c.campaign_name)]));
  const groupOn = new Map(
    adgroups.map((g) => [str(g.adgroup_id), g.operation_status === "ENABLE" && !!campaignOn.get(str(g.campaign_id))]),
  );
  const groupCampaign = new Map(adgroups.map((g) => [str(g.adgroup_id), str(g.campaign_id)]));

  const adEntities: Entity[] = ads.map((a) => ({
    level: "ad",
    id: str(a.ad_id),
    name: str(a.ad_name),
    parentId: str(a.adgroup_id),
    active: a.operation_status === "ENABLE" && !!groupOn.get(str(a.adgroup_id)),
    budget: null,
    dailyBudget: false,
    optimizationEvent: null,
    last7: a7.get(str(a.ad_id)) ?? emptyMetrics(),
    prev7: aPrev.get(str(a.ad_id)) ?? emptyMetrics(),
    wob: byAd.get(str(a.ad_id)) ?? null,
  }));
  const groupEntities: Entity[] = adgroups.map((g) => {
    const id = str(g.adgroup_id);
    const campaignId = str(g.campaign_id);
    // WOB's chats tie to an ad group through their ad, or through the campaign when it has only this ad group.
    const fromAds = sumFunnels(adEntities.filter((a) => a.parentId === id && a.wob).map((a) => a.wob as Funnel));
    const onlyGroup = adgroups.filter((x) => str(x.campaign_id) === campaignId).length === 1;
    return {
      level: "adgroup",
      id,
      name: str(g.adgroup_name),
      parentId: campaignId,
      active: !!groupOn.get(id),
      budget: Number(g.budget) || null,
      dailyBudget: g.budget_mode === "BUDGET_MODE_DAY",
      optimizationEvent: typeof g.optimization_event === "string" ? g.optimization_event : null,
      last7: g7.get(id) ?? emptyMetrics(),
      prev7: gPrev.get(id) ?? emptyMetrics(),
      wob: fromAds ?? (onlyGroup ? (byCampaign.get(campaignId) ?? null) : null),
    };
  });

  // The campaign each hit sits in, with WOB's funnel for it, so the numbers behind a suggestion are complete.
  const campaignOf = (h: Hit) =>
    h.level === "adgroup"
      ? groupCampaign.get(h.targetId)
      : groupCampaign.get(adEntities.find((a) => a.id === h.targetId)?.parentId ?? "");
  const entities = [...groupEntities, ...adEntities];
  const chats = (leads ?? []).length;
  const hits = ruleHits(entities, chats).map((h) => {
    const cid = campaignOf(h) ?? "";
    return {
      ...h,
      action: {
        ...h.action,
        campaign: { id: cid, name: campaignName.get(cid) ?? "", wob: byCampaign.get(cid) ?? null },
      },
    };
  });
  return { hits, summary: summarize(entities, chats) };
}
