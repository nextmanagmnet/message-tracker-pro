import { corsHeaders, isAuthorizedCron, json } from "../_shared/cron.ts";
import { serviceClient } from "../_shared/auth.ts";
import { sendConversionEvent } from "../_shared/conversions.ts";

// Re-sends conversion events that failed or never left (e.g. the function was killed mid-send).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = serviceClient();
  if (!(await isAuthorizedCron(req, supabase))) return json({ error: "Unauthorized" }, 401);

  const stale = new Date(Date.now() - 10 * 60_000).toISOString(); // don't race a send in progress
  const { data: events, error } = await supabase
    .from("conversion_events")
    .select("*")
    .in("status", ["failed", "pending"])
    .lt("attempts", 5)
    .lt("created_at", stale)
    .limit(100);
  if (error) return json({ error: error.message }, 500);

  for (const ev of events ?? []) await sendConversionEvent(supabase, ev);
  return json({ success: true, retried: events?.length ?? 0 });
});
