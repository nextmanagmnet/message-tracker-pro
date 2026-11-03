import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeClient } from "../_shared/auth.ts";
import { json } from "../_shared/cron.ts";
import type { TikTokContext } from "./types.ts";

// Fetch campaigns for a client with real spend data
export async function fetchCampaigns({
  req,
  parsedBody,
  supabaseUrl,
  supabaseServiceKey,
}: TikTokContext): Promise<Response> {
  const { clientId, dateFrom, dateTo } = parsedBody ?? (await req.json());
  const auth = await authorizeClient(req, clientId);
  if (auth instanceof Response) return auth;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get client info
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, agency_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return json({ error: "Client not found" }, 404);
  }

  // Get TikTok accounts for this client
  const { data: accounts, error: accountsError } = await supabase
    .from("tiktok_accounts")
    .select("*")
    .eq("client_id", clientId);

  if (accountsError || !accounts?.length) {
    return json({ error: "No TikTok accounts connected for this client" }, 400);
  }

  // Default date range: last 30 days
  const endDate = dateTo || new Date().toISOString().split("T")[0];
  const startDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const allCampaigns = [];

  for (const account of accounts) {
    // First fetch campaign list
    const campaignsResponse = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${account.advertiser_id}&page_size=100`,
      {
        headers: {
          "Access-Token": account.access_token,
        },
      },
    );

    const campaignsData = await campaignsResponse.json();

    if (campaignsData.code !== 0 || !campaignsData.data?.list) {
      console.error("Failed to fetch campaigns:", campaignsData);
      continue;
    }

    const campaignIds = campaignsData.data.list.map((c: { campaign_id: string }) => c.campaign_id);

    if (campaignIds.length === 0) continue;

    // Fetch spend data from TikTok reporting API. The endpoint is GET-only (POST returns an HTML 405);
    // arrays go JSON-encoded in the query string.
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
    const reportResponse = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${reportParams}`,
      { headers: { "Access-Token": account.access_token } },
    );
    const reportData = await reportResponse.json().catch(() => ({ code: -1 }));
    if (reportData.code !== 0) console.error("TikTok report failed", account.advertiser_id, reportData.message);

    // Build a map of campaign_id -> spend data
    const spendMap = new Map<string, { spend: number; clicks: number; impressions: number }>();
    if (reportData.code === 0 && reportData.data?.list) {
      for (const row of reportData.data.list) {
        const metrics = row.metrics;
        spendMap.set(row.dimensions.campaign_id, {
          spend: parseFloat(metrics.spend) || 0,
          clicks: parseInt(metrics.clicks) || 0,
          impressions: parseInt(metrics.impressions) || 0,
        });
      }
    }

    // Upsert campaigns with spend data
    for (const campaign of campaignsData.data.list) {
      const spendInfo = spendMap.get(campaign.campaign_id) || { spend: 0, clicks: 0, impressions: 0 };

      await supabase.from("tiktok_campaigns").upsert(
        {
          client_id: clientId,
          tenant_id: client.agency_id,
          tiktok_account_id: account.id,
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          spend: spendInfo.spend,
          clicks: spendInfo.clicks,
          impressions: spendInfo.impressions,
          // Note: real_conversations and trash_conversations come from WhatsApp webhook
        },
        {
          onConflict: "tenant_id,campaign_id",
        },
      );

      allCampaigns.push({
        id: campaign.campaign_id,
        name: campaign.campaign_name,
        status: campaign.status,
        spend: spendInfo.spend,
      });
    }
  }

  console.log(`Fetched ${allCampaigns.length} campaigns with spend data for client ${clientId}`);

  return json({ campaigns: allCampaigns });
}
