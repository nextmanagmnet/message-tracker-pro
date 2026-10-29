import { corsHeaders, isAuthorizedCron, json } from "../_shared/cron.ts";
import { serviceClient } from "../_shared/auth.ts";
import { reportStage } from "../_shared/conversions.ts";
import { canAdvance, parseAnalysis } from "../_shared/funnel.ts";
import { CLASSIFIER_MODEL, hasLlm, jsonCompletion, transcript } from "../_shared/llm.ts";

const AUTO_REPORT_CONFIDENCE = 0.8;

const SYSTEM = `You review WhatsApp chats between a business and a person who messaged it from an ad.
Decide how far the person got in the buying journey. Chats may be in Arabic, English, or a mix.

Stages:
- "real": a genuine person interested in the business, but no clear buying intent yet.
- "qualified": clear buying intent, e.g. asks price, size, availability, delivery, booking, or how to order.
- "client": an order or booking is confirmed in the chat, e.g. the business confirms the order, the customer sends an address or payment confirmation, or an appointment is booked.

Set is_spam=true for bots, wrong numbers, job seekers, competitors, scams, or chats with no real interest.
order_value: the order total if stated (number only), else null. currency: ISO code if known (e.g. SAR, AED, USD), else null.
confidence: 0..1, how sure you are about the stage. evidence: a short quote or reason. language: the customer's language code.`;

const SCHEMA = {
  type: "object",
  properties: {
    is_spam: { type: "boolean" },
    stage: { type: "string", enum: ["real", "qualified", "client"] },
    order_value: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    confidence: { type: "number" },
    evidence: { type: "string" },
    language: { type: "string" },
  },
  required: ["is_spam", "stage", "order_value", "currency", "confidence", "evidence", "language"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = serviceClient();
  if (!(await isAuthorizedCron(req, supabase))) return json({ error: "Unauthorized" }, 401);
  if (!hasLlm()) {
    console.warn("ANTHROPIC_API_KEY not set; skipping conversation analysis");
    return json({ skipped: true });
  }

  // Debounce: only chats that have been quiet for 3 minutes and changed since the last analysis.
  const quietSince = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data: candidates, error } = await supabase
    .from("conversations")
    .select("id, lead_id, last_message_at, analyzed_at")
    .lt("last_message_at", quietSince)
    .order("last_message_at", { ascending: true })
    .limit(200);
  if (error) return json({ error: error.message }, 500);
  // ponytail: column-vs-column filter done in JS; move to an RPC if the backlog grows past a few hundred rows.
  const due = (candidates ?? [])
    .filter((c: any) => !c.analyzed_at || Date.parse(c.analyzed_at) < Date.parse(c.last_message_at))
    .slice(0, 50);

  let analyzed = 0;
  let reported = 0;
  for (const conv of due) {
    const { data: lead } = await supabase.from("leads").select("id, stage").eq("id", conv.lead_id).maybeSingle();
    const markDone = () => supabase.from("conversations").update({ analyzed_at: new Date().toISOString() }).eq("id", conv.id);
    if (!lead || lead.stage === "not_lead" || lead.stage === "client") {
      await markDone();
      continue;
    }

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, author, text, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const raw = await jsonCompletion({
      model: CLASSIFIER_MODEL,
      system: SYSTEM,
      user: `Chat (oldest first):\n${transcript((msgs ?? []).reverse())}`,
      schema: SCHEMA,
      effort: "low",
      maxTokens: 1024,
    });
    const a = raw ? parseAnalysis(raw) : null;
    if (!a) continue; // retry next run
    analyzed++;

    if (a.is_spam) {
      // Never auto-discard someone already showing buying intent; the user can still do it by hand.
      if (a.confidence >= AUTO_REPORT_CONFIDENCE && lead.stage !== "qualified") {
        if ((await reportStage(supabase, lead.id, "not_lead")).changed) reported++;
      }
    } else if (canAdvance(lead.stage, a.stage)) {
      if (a.confidence >= AUTO_REPORT_CONFIDENCE) {
        if ((await reportStage(supabase, lead.id, a.stage, { value: a.order_value, currency: a.currency })).changed) reported++;
      } else {
        await supabase.from("leads").update({
          stage_suggestion: a.stage,
          stage_confidence: a.confidence,
          stage_evidence: a.evidence,
          ...(a.stage === "client" ? { order_value: a.order_value, order_currency: a.currency } : {}),
        }).eq("id", lead.id);
      }
    }
    await markDone();
  }

  return json({ success: true, candidates: due.length, analyzed, reported });
});
