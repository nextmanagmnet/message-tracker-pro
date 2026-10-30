import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeClient, serviceClient } from "../_shared/auth.ts";
import { reportStage } from "../_shared/conversions.ts";
import type { Stage } from "../_shared/funnel.ts";
import { sendWhatsAppText } from "../_shared/whatsappSend.ts";

// User actions on a lead from the Leads page. Body: { action, leadId, value?, currency? }.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const { action, leadId } = body;
    if (typeof leadId !== "string" || !leadId) return json({ error: "leadId is required" }, 400);

    const { data: lead } = await serviceClient()
      .from("leads").select("id, client_id, stage, stage_suggestion").eq("id", leadId).maybeSingle();
    if (!lead) return json({ error: "Lead not found" }, 404);
    const auth = await authorizeClient(req, lead.client_id);
    if (auth instanceof Response) return auth;
    const { supabase } = auth;

    const setAgent = async (agent_status: string) => {
      const { error } = await supabase.from("conversations").update({ agent_status }).eq("lead_id", leadId);
      return error ? json({ error: error.message }, 400) : json({ success: true, agentStatus: agent_status });
    };

    switch (action) {
      case "mark_client": {
        const value = body.value == null || body.value === "" ? null : Number(body.value);
        if (value != null && (!Number.isFinite(value) || value < 0)) return json({ error: "Invalid order value" }, 400);
        const currency = typeof body.currency === "string" && body.currency ? body.currency.toUpperCase().slice(0, 3) : null;
        const r = await reportStage(supabase, leadId, "client", { value, currency });
        if (!r.changed) return json({ error: "Lead is already a client or was marked not a lead" }, 409);
        return json({ success: true, stage: "client" });
      }
      case "mark_not_lead": {
        const r = await reportStage(supabase, leadId, "not_lead");
        return json({ success: r.changed, stage: r.changed ? "not_lead" : lead.stage });
      }
      case "accept_suggestion": {
        if (!lead.stage_suggestion) return json({ error: "No suggestion to accept" }, 400);
        const r = await reportStage(supabase, leadId, lead.stage_suggestion as Stage);
        return json({ success: r.changed, stage: r.changed ? lead.stage_suggestion : lead.stage });
      }
      case "send_message": {
        const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
        if (!text) return json({ error: "Message is empty" }, 400);
        const { data: conv } = await supabase.from("conversations").select("id").eq("lead_id", leadId).maybeSingle();
        if (!conv) return json({ error: "No conversation yet" }, 404);
        // Replying yourself pauses the AI on this chat.
        await supabase.from("conversations").update({ agent_status: "handed_off" }).eq("id", conv.id).eq("agent_status", "ai_active");
        const ok = await sendWhatsAppText(serviceClient(), conv.id, text, { author: "owner" });
        return ok ? json({ success: true }) : json({ error: "Couldn't send. Check that WhatsApp is connected." }, 502);
      }
      case "take_over":
        return setAgent("handed_off");
      case "hand_back":
        return setAgent("ai_active");
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("lead-actions error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
