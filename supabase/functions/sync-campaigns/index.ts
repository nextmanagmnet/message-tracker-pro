import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAuthorizedCron, json, logJob } from "../_shared/cron.ts";

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

/**
 * Scheduled spend/clicks sync for every connected TikTok advertiser account.
 * Runs hourly from the database scheduler; also callable manually with the
 * cron secret for a single client.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  if (!(await isAuthorizedCron(req, supabase))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let onlyClientId: string | null = null;
  let days = 7;
  try {
    const body = await req.json();
    onlyClientId = body?.clientId ?? null;
    if (body?.days) days = Math.min(90, Math.max(1, Number(body.days)));
  } catch {
    // no body — full sync
  }

  // Tomorrow (UTC): ad accounts ahead of UTC (e.g. Beirut) are already in "tomorrow"; TikTok accepts it.
  const endDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];

  let query = supabase
    .from("tiktok_accounts")
    .select("id, client_id, tenant_id, advertiser_id, access_token");
  if (onlyClientId) query = query.eq("client_id", onlyClientId);

  const { data: accounts, error } = await query;
  if (error) return json({ error: error.message }, 500);

  let synced = 0;
  const failures: Record<string, string> = {};

  for (const account of accounts ?? []) {
    try {
      const listRes = await fetch(
        `${TT_BASE}/campaign/get/?advertiser_id=${account.advertiser_id}&page_size=100`,
        { headers: { "Access-Token": account.access_token } }
      );
      const listData = await listRes.json();
      if (listData.code !== 0) throw new Error(listData.message ?? "Campaign list failed");
      const campaignList: any[] = listData.data?.list ?? [];

      // report/integrated/get is GET-only (POST returns an HTML 405); arrays go JSON-encoded in the query.
      const reportParams = new URLSearchParams({
        advertiser_id: account.advertiser_id,
        report_type: "BASIC",
        dimensions: JSON.stringify(["campaign_id"]),
        data_level: "AUCTION_CAMPAIGN",
        metrics: JSON.stringify(["spend", "clicks", "impressions"]),
        start_date: startDate,
        end_date: endDate,
        page_size: "200",
      });
      const reportData = campaignList.length
        ? await (await fetch(`${TT_BASE}/report/integrated/get/?${reportParams}`, {
            headers: { "Access-Token": account.access_token },
          })).json()
        : { code: 0, data: { list: [] } };
      if (reportData.code !== 0) console.error("TikTok report failed", account.advertiser_id, reportData.message);

      const metricsMap = new Map<string, { spend: number; clicks: number; impressions: number }>();
      if (reportData.code === 0) {
        for (const row of reportData.data?.list ?? []) {
          metricsMap.set(row.dimensions.campaign_id, {
            spend: parseFloat(row.metrics?.spend) || 0,
            clicks: parseInt(row.metrics?.clicks) || 0,
            impressions: parseInt(row.metrics?.impressions) || 0,
          });
        }
      }

      for (const campaign of campaignList) {
        const m = metricsMap.get(campaign.campaign_id);
        await supabase.from("tiktok_campaigns").upsert(
          {
            client_id: account.client_id,
            tenant_id: account.tenant_id,
            tiktok_account_id: account.id,
            campaign_id: campaign.campaign_id,
            campaign_name: campaign.campaign_name,
            spend: m?.spend ?? 0,
            clicks: m?.clicks ?? 0,
            impressions: m?.impressions ?? 0,
          },
          { onConflict: "tenant_id,campaign_id" }
        );
        synced++;
      }

      await logJob(supabase, "sync-campaigns", {
        clientId: account.client_id,
        status: "success",
        details: {
          advertiser_id: account.advertiser_id,
          campaigns: campaignList.length,
          window: { startDate, endDate },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("Campaign sync failed", account.advertiser_id, msg);
      failures[account.advertiser_id] = msg;
      await logJob(supabase, "sync-campaigns", {
        clientId: account.client_id,
        status: "failed",
        details: { advertiser_id: account.advertiser_id },
        error: msg,
      });
    }
  }

  // ---- Meta ad accounts: campaign-level insights for the same window.
  // Only clients who pasted the optional read-only token + ad account id; others are skipped.
  let metaQuery = supabase
    .from("meta_accounts")
    .select("id, client_id, ad_account_id, ads_token")
    .not("ads_token", "is", null)
    .not("ad_account_id", "is", null);
  if (onlyClientId) metaQuery = metaQuery.eq("client_id", onlyClientId);
  const { data: metaAccounts } = await metaQuery;

  for (const account of metaAccounts ?? []) {
    try {
      const params = new URLSearchParams({
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,clicks,impressions",
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        limit: "500",
        access_token: account.ads_token,
      });
      const res = await fetch(`https://graph.facebook.com/v21.0/act_${account.ad_account_id}/insights?${params}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message ?? `Meta error ${res.status}`);

      for (const row of data.data ?? []) {
        await supabase.from("meta_campaigns").upsert(
          {
            client_id: account.client_id,
            meta_account_id: account.id,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            spend: parseFloat(row.spend) || 0,
            clicks: parseInt(row.clicks) || 0,
            impressions: parseInt(row.impressions) || 0,
          },
          { onConflict: "client_id,campaign_id" }
        );
        synced++;
      }
      await logJob(supabase, "sync-campaigns", {
        clientId: account.client_id,
        status: "success",
        details: { provider: "meta", ad_account_id: account.ad_account_id, campaigns: data.data?.length ?? 0 },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      failures[account.ad_account_id] = msg;
      await logJob(supabase, "sync-campaigns", {
        clientId: account.client_id,
        status: "failed",
        details: { provider: "meta", ad_account_id: account.ad_account_id },
        error: msg,
      });
    }
  }

  return json({
    success: true,
    accounts: (accounts?.length ?? 0) + (metaAccounts?.length ?? 0),
    campaignsSynced: synced,
    failures,
  });
});
