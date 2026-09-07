import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAuthorizedCron, json, logJob } from "../_shared/cron.ts";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

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

  const appId = Deno.env.get("TIKTOK_APP_ID");
  const appSecret = Deno.env.get("TIKTOK_APP_SECRET");
  const results: Record<string, unknown>[] = [];

  // ---- 1. TikTok advertiser tokens ------------------------------------
  const { data: accounts } = await supabase
    .from("tiktok_accounts")
    .select("id, client_id, advertiser_id, access_token, refresh_token, token_expires_at");

  for (const account of accounts ?? []) {
    // Refresh anything expiring within the next 7 days (or unknown expiry).
    const expires = account.token_expires_at
      ? new Date(account.token_expires_at).getTime()
      : 0;
    const needsRefresh =
      !account.token_expires_at || expires - Date.now() < 7 * 24 * 3600 * 1000;

    if (!needsRefresh) continue;

    if (!account.refresh_token || !appId || !appSecret) {
      // Nothing we can do automatically — surface it so the agency can reconnect.
      await logJob(supabase, "refresh-tokens", {
        clientId: account.client_id,
        status: "needs_reconnect",
        details: { provider: "tiktok", advertiser_id: account.advertiser_id },
        error: "No refresh token available; client must reconnect TikTok",
      });
      results.push({ provider: "tiktok", account: account.id, status: "needs_reconnect" });
      continue;
    }

    try {
      const res = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: appId,
            secret: appSecret,
            refresh_token: account.refresh_token,
            grant_type: "refresh_token",
          }),
        }
      );
      const data = await res.json();

      if (data.code !== 0 || !data.data?.access_token) {
        throw new Error(data.message ?? "TikTok refresh failed");
      }

      const expiresIn = Number(data.data.access_token_expire_in ?? 0);
      await supabase
        .from("tiktok_accounts")
        .update({
          access_token: data.data.access_token,
          refresh_token: data.data.refresh_token ?? account.refresh_token,
          token_expires_at: expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null,
        })
        .eq("id", account.id);

      await logJob(supabase, "refresh-tokens", {
        clientId: account.client_id,
        status: "success",
        details: { provider: "tiktok", advertiser_id: account.advertiser_id },
      });
      results.push({ provider: "tiktok", account: account.id, status: "refreshed" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("TikTok token refresh failed", account.id, msg);
      await logJob(supabase, "refresh-tokens", {
        clientId: account.client_id,
        status: "failed",
        details: { provider: "tiktok", advertiser_id: account.advertiser_id },
        error: msg,
      });
      results.push({ provider: "tiktok", account: account.id, status: "failed" });
    }
  }

  // ---- 2. WhatsApp system-user token health ---------------------------
  const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  let whatsappTokenValid: boolean | null = null;
  if (waToken) {
    try {
      const res = await fetch(`${GRAPH_BASE}/me?access_token=${waToken}`);
      const data = await res.json();
      whatsappTokenValid = !data.error;

      if (!whatsappTokenValid) {
        // Mark every number as disconnected so the UI shows the problem.
        await supabase
          .from("whatsapp_numbers")
          .update({ status: "disconnected" })
          .neq("status", "disconnected");
      }

      await logJob(supabase, "refresh-tokens", {
        status: whatsappTokenValid ? "success" : "failed",
        details: { provider: "whatsapp", token_valid: whatsappTokenValid },
        error: whatsappTokenValid ? null : (data.error?.message ?? "Invalid token"),
      });
    } catch (e) {
      whatsappTokenValid = false;
      await logJob(supabase, "refresh-tokens", {
        status: "failed",
        details: { provider: "whatsapp" },
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return json({ success: true, whatsappTokenValid, results });
});
