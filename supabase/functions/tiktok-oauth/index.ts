import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { balance } from "./balance.ts";
import { fetchCampaigns } from "./campaigns.ts";
import { ensurePixelAction, testEvent } from "./events.ts";
import { callback, getAuthUrl, keepAccount } from "./oauth.ts";
import type { TikTokContext } from "./types.ts";

Deno.serve(
  withCors(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(req.url);
      // Support action via query param (legacy) OR JSON body (preferred for function invoke)
      let action: string | null | undefined = url.searchParams.get("action");
      let parsedBody: TikTokContext["parsedBody"] = null;
      if (!action && req.method !== "GET") {
        try {
          parsedBody = await req.json();
          action = parsedBody?.action;
        } catch {
          // ignore body parse errors
        }
      }

      const tiktokAppId = Deno.env.get("TIKTOK_APP_ID");
      const tiktokAppSecret = Deno.env.get("TIKTOK_APP_SECRET");

      if (!tiktokAppId || !tiktokAppSecret) {
        console.error("TikTok credentials not configured");
        return json({ error: "TikTok integration not configured" }, 400);
      }

      const ctx: TikTokContext = {
        req,
        parsedBody,
        supabaseUrl: Deno.env.get("SUPABASE_URL")!,
        supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        tiktokAppId,
        tiktokAppSecret,
      };

      switch (action) {
        case "test-event":
          return await testEvent(ctx);
        case "ensure-pixel":
          return await ensurePixelAction(ctx);
        case "get-auth-url":
          return await getAuthUrl(ctx);
        case "callback":
          return await callback(ctx);
        case "keep-account":
          return await keepAccount(ctx);
        case "balance":
          return await balance(ctx);
        case "fetch-campaigns":
          return await fetchCampaigns(ctx);
        default:
          return json({ error: "Invalid action" }, 400);
      }
    } catch (error: unknown) {
      console.error("Error in tiktok-oauth function:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return json({ error: errorMessage }, 500);
    }
  }),
);
