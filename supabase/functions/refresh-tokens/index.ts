import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAuthorizedCron, json, logJob } from "../_shared/cron.ts";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

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
        // Mark Cloud API numbers disconnected so the UI shows the problem (QR lines don't use this token).
        await supabase
          .from("whatsapp_numbers")
          .update({ status: "disconnected" })
          .neq("status", "disconnected")
          .not("waba_id", "in", "(evolution,green-api)");
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

  // ---- 3. Meta ad account tokens (long-lived, ~60 days; can't be refreshed server-side)
  const metaAppId = Deno.env.get("META_APP_ID");
  const metaAppSecret = Deno.env.get("META_APP_SECRET");
  if (metaAppId && metaAppSecret) {
    const { data: metaAccounts } = await supabase
      .from("meta_accounts")
      .select("id, client_id, ad_account_id, access_token, token_expires_at")
      .neq("ad_account_id", "pending");
    for (const account of metaAccounts ?? []) {
      try {
        const res = await fetch(
          `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(account.access_token)}&access_token=${metaAppId}|${metaAppSecret}`
        );
        const info = (await res.json())?.data ?? {};
        const expiresAt = info.expires_at ? info.expires_at * 1000 : null;
        const expiringSoon = expiresAt !== null && expiresAt !== 0 && expiresAt - Date.now() < 7 * 24 * 3600 * 1000;
        if (expiresAt) {
          await supabase.from("meta_accounts")
            .update({ token_expires_at: new Date(expiresAt).toISOString() }).eq("id", account.id);
        }
        const status = !info.is_valid ? "needs_reconnect" : expiringSoon ? "expiring_soon" : "success";
        await logJob(supabase, "refresh-tokens", {
          clientId: account.client_id,
          status: status === "success" ? "success" : "needs_reconnect",
          details: { provider: "meta", ad_account_id: account.ad_account_id, state: status },
          error: status === "success" ? null : "Meta token invalid or expiring; client must reconnect Meta",
        });
        results.push({ provider: "meta", account: account.id, status });
      } catch (e) {
        results.push({ provider: "meta", account: account.id, status: "failed" });
        console.error("Meta token check failed", account.id, e);
      }
    }
  }

  return json({ success: true, whatsappTokenValid, results });
});
