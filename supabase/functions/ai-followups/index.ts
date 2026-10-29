import { corsHeaders, isAuthorizedCron, json } from "../_shared/cron.ts";
import { serviceClient } from "../_shared/auth.ts";
import { isFollowUpEligible } from "../_shared/funnel.ts";
import { hasLlm, jsonCompletion, REPLY_MODEL, transcript } from "../_shared/llm.ts";
import { sendWhatsAppText } from "../_shared/whatsappSend.ts";

const SCHEMA = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = serviceClient();
  if (!(await isAuthorizedCron(req, supabase))) return json({ error: "Unauthorized" }, 401);
  if (!hasLlm()) return json({ skipped: true });

  const { data: settingsRows } = await supabase
    .from("ai_agent_settings").select("*").eq("enabled", true).eq("follow_up_enabled", true);
  const now = new Date();
  let sent = 0;

  for (const s of settingsRows ?? []) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, agent_status, last_inbound_at, last_outbound_at, last_follow_up_at, follow_up_count")
      .eq("client_id", s.client_id)
      .eq("agent_status", "ai_active")
      .lt("follow_up_count", s.follow_up_max ?? 2)
      .not("last_outbound_at", "is", null)
      .limit(100);

    for (const c of convs ?? []) {
      const eligible = isFollowUpEligible({
        agentStatus: c.agent_status,
        followUpEnabled: true,
        lastInboundAt: c.last_inbound_at,
        lastOutboundAt: c.last_outbound_at,
        lastFollowUpAt: c.last_follow_up_at,
        followUpCount: c.follow_up_count ?? 0,
        followUpMax: s.follow_up_max ?? 2,
        delayHours: s.follow_up_delay_hours ?? 24,
        allowedStart: s.allowed_hours_start ?? 9,
        allowedEnd: s.allowed_hours_end ?? 21,
        timezone: s.timezone || "Asia/Riyadh",
        now,
      });
      if (!eligible) continue;

      const { data: msgs } = await supabase.from("messages").select("direction, author, text, created_at")
        .eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(20);
      const raw = await jsonCompletion({
        model: REPLY_MODEL,
        system: `You write one short, friendly WhatsApp follow-up from a business to a customer who went quiet.
Use the customer's language. Refer to what they were interested in. No pressure, no invented offers.
Business information: ${s.business_knowledge || "(none)"}. Tone: ${s.tone || "friendly"}.`,
        user: `Chat (oldest first):\n${transcript((msgs ?? []).reverse())}`,
        schema: SCHEMA,
        effort: "low",
        maxTokens: 1024,
      });
      const message = raw ? (() => { try { return String(JSON.parse(raw).message || "").trim(); } catch { return ""; } })() : "";
      if (!message) continue;

      if (await sendWhatsAppText(supabase, c.id, message)) {
        await supabase.from("conversations").update({
          follow_up_count: (c.follow_up_count ?? 0) + 1,
          last_follow_up_at: new Date().toISOString(),
        }).eq("id", c.id);
        sent++;
      }
    }
  }
  return json({ success: true, sent });
});
