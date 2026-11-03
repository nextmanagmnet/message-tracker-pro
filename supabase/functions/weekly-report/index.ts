import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAuthorizedCron, json, logJob } from "../_shared/cron.ts";
import { authorizeClient, serviceClient } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";
import { CLASSIFIER_MODEL, hasLlm, jsonCompletion } from "../_shared/llm.ts";
import {
  buildReport,
  formatReport,
  isDue,
  normalizePhone,
  sendEvolutionText,
  weekWindows,
  worthInsight,
  type CampaignRow,
  type Lang,
  type LeadRow,
  type Report,
} from "../_shared/weeklyReport.ts";

// Weekly WhatsApp summary to the business owner.
// Cron (x-cron-secret, hourly): sends every due report. App: { action: "preview" | "send-test", clientId }.

const JOB = "weekly-report";
const PAGE = 1000;

type Settings = {
  client_id: string;
  enabled: boolean;
  phone: string | null;
  language: string;
  weekday: number;
  hour: number;
  timezone: string;
  last_sent_at: string | null;
};

const INSIGHT_SCHEMA = {
  type: "object",
  properties: { insight: { type: "string" } },
  required: ["insight"],
  additionalProperties: false,
};

async function loadLeads(supabase: SupabaseClient, clientId: string, since: Date): Promise<LeadRow[]> {
  const out: LeadRow[] = [];
  const iso = since.toISOString();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("stage, status, order_status, order_value, order_currency, campaign_id, created_at, order_confirmed_at")
      .eq("client_id", clientId)
      .or(`created_at.gte.${iso},order_confirmed_at.gte.${iso}`)
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data as LeadRow[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function loadReport(supabase: SupabaseClient, clientId: string, timezone: string, now: Date): Promise<Report> {
  const { prevStart } = weekWindows(now, timezone);
  const [leads, tiktok, meta] = await Promise.all([
    loadLeads(supabase, clientId, prevStart),
    supabase.from("tiktok_campaigns").select("campaign_id, campaign_name, spend").eq("client_id", clientId),
    supabase.from("meta_campaigns").select("campaign_id, campaign_name, spend").eq("client_id", clientId),
  ]);
  const campaigns: CampaignRow[] = [...(tiktok.data ?? []), ...(meta.data ?? [])];
  return buildReport(leads, campaigns, now, timezone);
}

// Optional one-liner; any failure just leaves it out.
async function insightFor(report: Report, lang: Lang): Promise<string | null> {
  if (!hasLlm() || !worthInsight(report)) return null;
  const raw = await jsonCompletion({
    model: CLASSIFIER_MODEL,
    system:
      "You write one short, practical insight (max 20 words) for a small business owner about their week of WhatsApp leads from ads. " +
      "Use only the numbers given; no greetings, no emojis, no invented facts. " +
      `Write in ${lang === "ar" ? "Arabic" : "English"}.`,
    user: JSON.stringify({
      thisWeek: report.current,
      lastWeek: report.previous,
      adSpendUsd: report.spend,
      best: report.best,
    }),
    schema: INSIGHT_SCHEMA,
    effort: "low",
    maxTokens: 300,
  });
  try {
    const insight = raw ? (JSON.parse(raw) as { insight?: unknown }).insight : null;
    return typeof insight === "string" && insight.trim() ? insight.trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

async function composeMessage(supabase: SupabaseClient, clientId: string, lang: Lang, timezone: string) {
  const report = await loadReport(supabase, clientId, timezone, new Date());
  return formatReport(report, lang, await insightFor(report, lang));
}

const asLang = (v: unknown, fallback: Lang): Lang => (v === "ar" || v === "en" ? v : fallback);

// Sends from the client's own connected Evolution line; returns a reason when it can't.
async function deliver(supabase: SupabaseClient, s: Settings, text: string, markSent: boolean): Promise<string | null> {
  const phone = s.phone ? normalizePhone(s.phone) : null;
  if (!phone) return "no valid owner phone";
  const { data: line } = await supabase
    .from("whatsapp_numbers")
    .select("phone_number_id")
    .eq("client_id", s.client_id)
    .eq("status", "connected")
    .eq("waba_id", "evolution")
    .limit(1)
    .maybeSingle();
  if (!line) return "no connected WhatsApp line";
  const baseUrl = Deno.env.get("EVOLUTION_API_URL") || "";
  const apiKey = Deno.env.get("EVOLUTION_API_KEY") || "";
  if (!baseUrl || !apiKey) return "Evolution API not configured";
  const ok = await sendEvolutionText({ baseUrl, apiKey, instance: line.phone_number_id }, phone, text);
  if (!ok) return "send failed";
  // A test send doesn't count, so it never pushes back the scheduled report.
  if (markSent)
    await supabase
      .from("weekly_report_settings")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("client_id", s.client_id);
  return null;
}

async function runCron(supabase: SupabaseClient) {
  const { data: rows } = await supabase.from("weekly_report_settings").select("*").eq("enabled", true);
  const now = new Date();
  let sent = 0;
  for (const s of (rows ?? []) as Settings[]) {
    if (!isDue(s, now)) continue;
    try {
      const text = await composeMessage(supabase, s.client_id, asLang(s.language, "en"), s.timezone);
      const reason = await deliver(supabase, s, text, true);
      if (reason) {
        console.warn(`weekly-report skipped ${s.client_id}: ${reason}`);
        await logJob(supabase, JOB, { clientId: s.client_id, status: "skipped", details: { reason } });
      } else {
        sent++;
        await logJob(supabase, JOB, { clientId: s.client_id, status: "success" });
      }
    } catch (e) {
      console.error(`weekly-report failed ${s.client_id}`, e);
      await logJob(supabase, JOB, { clientId: s.client_id, status: "error", error: String(e) });
    }
  }
  return json({ success: true, sent });
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (!req.headers.get("Authorization")?.startsWith("Bearer ")) {
      const supabase = serviceClient();
      if (!(await isAuthorizedCron(req, supabase))) return json({ error: "Unauthorized" }, 401);
      return await runCron(supabase);
    }

    const body = await req.json().catch(() => ({}));
    const auth = await authorizeClient(req, body.clientId);
    if (auth instanceof Response) return auth;
    const { supabase, userId } = auth;
    const clientId = body.clientId as string;
    const { data: saved } = await supabase
      .from("weekly_report_settings")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    const settings = saved as Settings | null;

    try {
      switch (body.action) {
        case "preview": {
          // The form's unsaved language/timezone win, so the owner sees what they're about to save.
          const lang = asLang(body.language, asLang(settings?.language, "en"));
          const tz = typeof body.timezone === "string" && body.timezone ? body.timezone : (settings?.timezone ?? "UTC");
          return json({ text: await composeMessage(supabase, clientId, lang, tz) });
        }
        case "send-test": {
          const { data: client } = await supabase.from("clients").select("agency_id").eq("id", clientId).maybeSingle();
          const roles = await Promise.all(
            ["owner", "admin"].map((role) =>
              supabase.rpc("has_agency_role", { _user_id: userId, _agency_id: client?.agency_id, _role: role }),
            ),
          );
          if (!roles.some((r) => r.data)) return json({ error: "Only agency owners and admins can do this" }, 403);
          if (!settings) return json({ error: "Save the weekly report settings first" }, 400);
          const text = await composeMessage(supabase, clientId, asLang(settings.language, "en"), settings.timezone);
          const reason = await deliver(supabase, settings, text, false);
          await logJob(supabase, JOB, {
            clientId,
            status: reason ? "skipped" : "success",
            details: { test: true, ...(reason ? { reason } : {}) },
          });
          return reason ? json({ error: reason }, 409) : json({ success: true });
        }
        default:
          return json({ error: "Unknown action" }, 400);
      }
    } catch (e) {
      console.error("weekly-report action failed", e);
      return json({ error: "Could not build the report" }, 500);
    }
  }),
);
