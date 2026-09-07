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
  if (!isAuthorizedCron(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let onlyClientId: string | null = null;
  let days = 7;
  try {
    const body = await req.json();
    onlyClientId = body?.clientId ?? null;
    if (body?.days) days = Math.min(90, Math.max(1, Number(body.days)));
  } catch {
    // no body — full sync
  }

  const endDate = new Date().toISOString().split("T")[0];
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
      if (listData.code !== 0 || !listData.data?.list?.length) {
        throw new Error(listData.message ?? "No campaigns returned");
      }

      const campaignIds = listData.data.list.map((c: any) => c.campaign_id);

      const reportRes = await fetch(`${TT_BASE}/report/integrated/get/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": account.access_token,
        },
        body: JSON.stringify({
          advertiser_id: account.advertiser_id,
          report_type: "BASIC",
          dimensions: ["campaign_id"],
          data_level: "AUCTION_CAMPAIGN",
          metrics: ["spend", "clicks", "impressions", "conversion"],
          start_date: startDate,
          end_date: endDate,
          page_size: 200,
          filtering: { campaign_ids: campaignIds },
        }),
      });
      const reportData = await reportRes.json();

      const spendMap = new Map<string, number>();
      if (reportData.code === 0) {
        for (const row of reportData.data?.list ?? []) {
          spendMap.set(
            row.dimensions.campaign_id,
            parseFloat(row.metrics?.spend) || 0
          );
        }
      }

      for (const campaign of listData.data.list) {
        await supabase.from("tiktok_campaigns").upsert(
          {
            client_id: account.client_id,
            tenant_id: account.tenant_id,
            tiktok_account_id: account.id,
            campaign_id: campaign.campaign_id,
            campaign_name: campaign.campaign_name,
            spend: spendMap.get(campaign.campaign_id) ?? 0,
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
          campaigns: listData.data.list.length,
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

  return json({
    success: true,
    accounts: accounts?.length ?? 0,
    campaignsSynced: synced,
    failures,
  });
});
