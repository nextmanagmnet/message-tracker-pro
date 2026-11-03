import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAgencyAdmin, authorizeClient, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, isAuthorizedCron, json, logJob } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { CLASSIFIER_MODEL, hasLlm, jsonCompletion } from "../_shared/llm.ts";
import {
  dedupeKey,
  fallbackCopy,
  isReconnectError,
  nextBudget,
  parseCopy,
  PURCHASES_TO_SWITCH,
  type Lang,
} from "../_shared/optimizer.ts";
import { TikTokApiError, tiktokApi } from "../_shared/tiktokApi.ts";
import { findHits, getAccount, list } from "./collect.ts";

/**
 * AI campaign optimizer: deterministic rules find what to change, the AI only words it, and nothing
 * reaches TikTok until an owner/admin presses Apply.
 * Body: { action: "analyze" | "list", clientId, language? } or { action: "apply" | "dismiss", id }.
 * The weekly schedule calls it with the cron secret and no clientId: every client with TikTok connected.
 */

type Rec = {
  id: string;
  client_id: string;
  level: string;
  target_id: string;
  kind: string;
  status: string;
  action: Record<string, unknown>;
};

async function analyze(supabase: SupabaseClient, clientId: string, lang: Lang) {
  const acc = await getAccount(supabase, clientId);
  if (!acc) return { noAccount: true, created: 0 };
  const allHits = await findHits(supabase, acc, clientId);

  const { data: pending } = await supabase
    .from("ad_recommendations")
    .select("level, target_id, kind")
    .eq("client_id", clientId)
    .eq("status", "pending");
  const seen = new Set((pending ?? []).map(dedupeKey));
  const hits = allHits.filter((h) => !seen.has(dedupeKey({ level: h.level, target_id: h.targetId, kind: h.kind })));
  if (hits.length === 0) return { created: 0, found: allHits.length };

  const raw = hasLlm()
    ? await jsonCompletion({
        model: CLASSIFIER_MODEL,
        effort: "low",
        system:
          "You write short recommendations for a small business owner who runs TikTok ads that start WhatsApp chats. " +
          "For each finding, write a title (max 8 words) and a plain-language rationale (1-2 sentences) explaining " +
          "why, using only the numbers given. Money is in USD. 'qualified' means serious buyers WOB found in the chats. " +
          "Do not invent numbers or promise results. For a 'switch_event_not_yet' topic, explain that optimizing for " +
          `purchases needs about ${PURCHASES_TO_SWITCH} purchases a week first. Write in ${lang === "ar" ? "Arabic" : "English"}.`,
        user: JSON.stringify(
          hits.map((h, index) => ({ index, level: h.level, name: h.name, kind: h.kind, ...h.action })),
        ),
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { index: { type: "integer" }, title: { type: "string" }, rationale: { type: "string" } },
                required: ["index", "title", "rationale"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      })
    : null;
  const copy = parseCopy(raw, hits.length);

  const { error } = await supabase.from("ad_recommendations").insert(
    hits.map((h, i) => {
      const c = copy[i] ?? fallbackCopy(h, lang);
      return {
        client_id: clientId,
        platform: "tiktok",
        level: h.level,
        target_id: h.targetId,
        kind: h.kind,
        title: c.title,
        rationale: c.rationale,
        action: { ...h.action, name: h.name },
      };
    }),
  );
  if (error) throw new Error(error.message);
  return { created: hits.length, found: allHits.length };
}

/** Executes a stored recommendation on TikTok. Guidance-only kinds are refused: they need a new ad group or video. */
async function apply(supabase: SupabaseClient, rec: Rec, userId: string) {
  if (rec.status !== "pending") return json({ error: "This recommendation was already decided" }, 409);
  if (rec.action.type !== "pause" && rec.action.type !== "budget")
    return json({ error: "This one is guidance only: nothing can be changed on TikTok automatically" }, 400);
  const acc = await getAccount(supabase, rec.client_id);
  if (!acc) return json({ reconnect: true, error: "Connect TikTok first" });

  let result: Record<string, unknown>;
  try {
    if (rec.action.type === "pause") {
      const isAd = rec.level === "ad";
      await tiktokApi(isAd ? "ad/status/update/" : "adgroup/status/update/", acc.access_token, {
        body: {
          advertiser_id: acc.advertiser_id,
          [isAd ? "ad_ids" : "adgroup_ids"]: [rec.target_id],
          operation_status: "DISABLE",
        },
      });
      result = { operation_status: "DISABLE" };
    } else {
      // Re-read the live budget: the stored one may be stale.
      const [g] = await list("adgroup/get/", acc, ["adgroup_id", "budget", "budget_mode"], {
        adgroup_ids: [rec.target_id],
      });
      if (!g) return json({ error: "Ad group not found on TikTok" }, 404);
      if (g.budget_mode !== "BUDGET_MODE_DAY") return json({ error: "Only daily budgets can be changed here" }, 400);
      const from = Number(g.budget) || 0;
      const to = nextBudget(from, Number(rec.action.pct) || 0);
      if (to === from) return json({ error: "The budget is already at TikTok's minimum" }, 400);
      await tiktokApi("adgroup/budget/update/", acc.access_token, {
        body: { advertiser_id: acc.advertiser_id, budget: [{ adgroup_id: rec.target_id, budget: to }] },
      });
      result = { from, to };
    }
  } catch (e) {
    if (e instanceof TikTokApiError && isReconnectError(e.code, e.message))
      return json({ reconnect: true, error: e.message });
    const message = e instanceof Error ? e.message : "TikTok error";
    await decide(supabase, rec.id, userId, "failed", { error: message });
    return json({ error: message }, 502);
  }
  await decide(supabase, rec.id, userId, "applied", result);
  return json({ success: true, status: "applied", result });
}

const decide = (
  supabase: SupabaseClient,
  id: string,
  userId: string,
  status: string,
  result: Record<string, unknown> | null,
) =>
  supabase
    .from("ad_recommendations")
    .update({ status, result, decided_by: userId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");

const langOf = (v: unknown): Lang => (v === "ar" ? "ar" : "en");

function failure(e: unknown) {
  if (e instanceof TikTokApiError && isReconnectError(e.code, e.message))
    return json({ reconnect: true, error: e.message });
  console.error("ad-optimizer error", e);
  return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const body = await req.json().catch(() => ({}));
    const supabase = serviceClient();

    // Weekly schedule: analyze every client with TikTok connected, in their weekly-report language.
    if (req.headers.has("x-cron-secret")) {
      if (!(await isAuthorizedCron(req, supabase))) return json({ error: "Unauthorized" }, 401);
      const { data: accounts } = await supabase.from("tiktok_accounts").select("client_id");
      const results: Record<string, unknown> = {};
      for (const clientId of new Set((accounts ?? []).map((a) => a.client_id as string))) {
        const { data: s } = await supabase
          .from("weekly_report_settings")
          .select("language")
          .eq("client_id", clientId)
          .maybeSingle();
        try {
          results[clientId] = await analyze(supabase, clientId, langOf(s?.language));
          await logJob(supabase, "ad-optimizer", {
            clientId,
            status: "success",
            details: results[clientId] as Record<string, unknown>,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          results[clientId] = { error: msg };
          await logJob(supabase, "ad-optimizer", { clientId, status: "failed", error: msg });
        }
      }
      return json({ success: true, results });
    }

    try {
      if (body.action === "apply" || body.action === "dismiss") {
        if (typeof body.id !== "string" || !body.id) return json({ error: "id is required" }, 400);
        const { data: rec } = await supabase
          .from("ad_recommendations")
          .select("id, client_id, level, target_id, kind, status, action, clients(agency_id)")
          .eq("id", body.id)
          .maybeSingle();
        if (!rec) return json({ error: "Recommendation not found" }, 404);
        const agency = rec.clients as { agency_id?: string } | null;
        const auth = await authorizeAgencyAdmin(req, agency?.agency_id);
        if (auth instanceof Response) return auth;
        if (body.action === "apply") return await apply(supabase, rec as Rec, auth.userId);
        const { data: done } = await decide(supabase, rec.id, auth.userId, "dismissed", null).select("id");
        return done?.length ? json({ success: true, status: "dismissed" }) : json({ error: "Already decided" }, 409);
      }

      const auth = await authorizeClient(req, body.clientId);
      if (auth instanceof Response) return auth;
      switch (body.action) {
        case "analyze":
          return json({ success: true, ...(await analyze(supabase, body.clientId, langOf(body.language))) });
        case "list": {
          const [{ data, error }, acc] = await Promise.all([
            supabase
              .from("ad_recommendations")
              .select("id, level, target_id, kind, title, rationale, action, status, result, created_at, decided_at")
              .eq("client_id", body.clientId)
              .order("created_at", { ascending: false })
              .limit(200),
            getAccount(supabase, body.clientId),
          ]);
          if (error) return json({ error: error.message }, 500);
          return json({ recommendations: data ?? [], hasAccount: !!acc });
        }
        default:
          return json({ error: "Unknown action" }, 400);
      }
    } catch (e) {
      return failure(e);
    }
  }),
);
