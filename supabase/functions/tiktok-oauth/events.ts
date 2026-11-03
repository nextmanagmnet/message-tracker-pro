import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeClient } from "../_shared/auth.ts";
import { json } from "../_shared/cron.ts";
import { ensurePixel } from "../_shared/tiktokPixel.ts";
import type { TikTokContext } from "./types.ts";

// Send a test Contact event via Events API 2.0 (requires signed-in user with client access)
export async function testEvent({
  req,
  parsedBody,
  supabaseUrl,
  supabaseServiceKey,
}: TikTokContext): Promise<Response> {
  const { clientId, testEventCode } = parsedBody ?? {};
  if (typeof clientId !== "string" || !clientId) {
    return json({ error: "Client ID is required" }, 400);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: visible } = await userClient.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!visible) {
    return json({ error: "Not allowed for this client" }, 403);
  }
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: account } = await admin
    .from("tiktok_accounts")
    .select("access_token")
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();
  const { data: pixel } = await admin
    .from("tiktok_pixels")
    .select("pixel_code")
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();
  if (!account || !pixel) {
    return json({ error: !account ? "No TikTok account connected" : "No Pixel ID saved in Settings" }, 400);
  }
  const body: Record<string, unknown> = {
    event_source: "web",
    event_source_id: pixel.pixel_code,
    data: [
      {
        event: "Contact",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `test_${crypto.randomUUID()}`,
        page: { url: "https://wa.me/" },
        properties: { description: "WhatsConnect test event" },
      },
    ],
  };
  if (typeof testEventCode === "string" && testEventCode.trim()) body.test_event_code = testEventCode.trim();
  const resp = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "Access-Token": account.access_token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await resp.json();
  console.log("TikTok test event result:", result?.code, result?.message);
  return json({ accepted: result?.code === 0, code: result?.code, message: result?.message });
}

// Reuse (or create) the ad account's pixel and register WOB's events on it.
export async function ensurePixelAction({
  req,
  parsedBody,
  supabaseUrl,
  supabaseServiceKey,
}: TikTokContext): Promise<Response> {
  const { clientId } = parsedBody ?? {};
  const auth = await authorizeClient(req, clientId);
  if (auth instanceof Response) return auth;
  try {
    const pixel = await ensurePixel(createClient(supabaseUrl, supabaseServiceKey), clientId as string); // authorizeClient checked it
    return json({ success: true, ...pixel });
  } catch (e) {
    // 200 + error so the UI can show TikTok's message and offer the manual pixel field
    return json({ error: e instanceof Error ? e.message : "Pixel setup failed" });
  }
}
