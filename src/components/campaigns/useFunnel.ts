import { useCallback, useEffect, useMemo, useState } from "react";
import { db, Lead, LEAD_COLUMNS, Platform, atLeast, stageOf } from "@/components/leads/shared";
import type { DateRange } from "@/components/dashboard/DateRangePicker";

export type CampaignRow = {
  key: string;
  platform: Platform;
  campaignId: string;
  name: string;
  spend: number;
  clicks: number;
  impressions: number;
  real: number;
  qualified: number;
  clients: number;
  trash: number;
  revenue: number;
};

export type Totals = Omit<CampaignRow, "key" | "platform" | "campaignId" | "name"> & {
  leads: number;
  conversionsSent: number;
};

type DbCampaign = { campaign_id: string; campaign_name: string; spend: number | null; clicks: number | null; impressions: number | null };

const emptyRow = (platform: Platform, campaignId: string, name: string): CampaignRow => ({
  key: `${platform}:${campaignId}`, platform, campaignId, name,
  spend: 0, clicks: 0, impressions: 0, real: 0, qualified: 0, clients: 0, trash: 0, revenue: 0,
});

function tally(row: Pick<CampaignRow, "real" | "qualified" | "clients" | "trash" | "revenue">, l: Lead) {
  if (stageOf(l) === "not_lead") row.trash++;
  if (atLeast(l, "real")) row.real++;
  if (atLeast(l, "qualified")) row.qualified++;
  if (stageOf(l) === "client") {
    row.clients++;
    row.revenue += Number(l.order_value) || 0;
  }
}

/**
 * Leads in the date range + campaign rows for both platforms, rolled into a funnel.
 * ponytail: campaign spend/clicks are whatever window the last sync pulled, not
 * re-cut by the picked date range; add per-day insights rows if that matters.
 */
export function useFunnel(clientId: string | undefined, range: DateRange) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<{ tiktok: DbCampaign[]; meta: DbCampaign[] }>({ tiktok: [], meta: [] });
  const [conversionsSent, setConversionsSent] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) {
      setLeads([]);
      setCampaigns({ tiktok: [], meta: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const cols = "campaign_id, campaign_name, spend, clicks, impressions";
    const [l, tt, mt, ev] = await Promise.all([
      db.from("leads").select(LEAD_COLUMNS).eq("client_id", clientId)
        .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false }).limit(5000),
      db.from("tiktok_campaigns").select(cols).eq("client_id", clientId),
      db.from("meta_campaigns").select(cols).eq("client_id", clientId),
      db.from("conversion_events").select("id, leads!inner(client_id)", { count: "exact", head: true })
        .eq("leads.client_id", clientId).eq("status", "sent")
        .gte("sent_at", range.from.toISOString()).lte("sent_at", range.to.toISOString()),
    ]);
    if (l.error) console.error("leads load failed", l.error);
    setLeads((l.data ?? []) as Lead[]);
    // meta_campaigns may not exist until the Meta migration lands; treat as empty.
    setCampaigns({ tiktok: (tt.data ?? []) as DbCampaign[], meta: (mt.data ?? []) as DbCampaign[] });
    setConversionsSent(ev.count ?? 0);
    setLoading(false);
  }, [clientId, range]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const map = new Map<string, CampaignRow>();
    for (const [platform, list] of [["tiktok", campaigns.tiktok], ["meta", campaigns.meta]] as const) {
      for (const c of list) {
        const r = emptyRow(platform, c.campaign_id, c.campaign_name);
        r.spend = Number(c.spend) || 0;
        r.clicks = Number(c.clicks) || 0;
        r.impressions = Number(c.impressions) || 0;
        map.set(r.key, r);
      }
    }
    for (const l of leads) {
      if (!l.ad_platform || !l.campaign_id) continue;
      const key = `${l.ad_platform}:${l.campaign_id}`;
      if (!map.has(key)) map.set(key, emptyRow(l.ad_platform, l.campaign_id, l.referral_headline ?? l.campaign_id));
      tally(map.get(key)!, l);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend || b.real - a.real);
  }, [leads, campaigns]);

  const totals = useMemo<Totals>(() => {
    const t: Totals = { spend: 0, clicks: 0, impressions: 0, real: 0, qualified: 0, clients: 0, trash: 0, revenue: 0, leads: leads.length, conversionsSent };
    for (const r of rows) {
      t.spend += r.spend;
      t.clicks += r.clicks;
      t.impressions += r.impressions;
    }
    for (const l of leads) tally(t, l); // all leads, attributed or not
    return t;
  }, [rows, leads, conversionsSent]);

  return { leads, rows, totals, loading, reload: load };
}

export const ratio = (cost: number, count: number) => (count > 0 ? cost / count : null);
