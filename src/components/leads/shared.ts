import { FunctionsHttpError } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

export const db = supabase;

export type Stage = "new" | "real" | "qualified" | "client" | "not_lead";
export type Platform = "tiktok" | "meta";

export type Lead = {
  id: string;
  client_id: string;
  whatsapp_number_id: string | null;
  sender_phone_hash: string;
  first_message: string;
  status: "verified" | "pending" | "trash";
  stage: Stage | null;
  stage_suggestion: Stage | null;
  stage_confidence: number | null;
  stage_evidence: string | null;
  order_value: number | null;
  order_currency: string | null;
  ad_platform: Platform | null;
  campaign_id: string | null;
  ad_id: string | null;
  referral_headline: string | null;
  attribution_source: string | null;
  quality_score: number | null;
  created_at: string;
};

export const LEAD_COLUMNS =
  "id, client_id, whatsapp_number_id, sender_phone_hash, first_message, status, stage, stage_suggestion, stage_confidence, stage_evidence, order_value, order_currency, ad_platform, campaign_id, ad_id, referral_headline, attribution_source, quality_score, created_at";

const RANK: Record<Stage, number> = { not_lead: -1, new: 0, real: 1, qualified: 2, client: 3 };

/** Legacy leads have no stage yet; fall back to the rule-based status. */
export function stageOf(l: Pick<Lead, "stage" | "status">): Stage {
  if (l.stage) return l.stage;
  if (l.status === "verified") return "real";
  if (l.status === "trash") return "not_lead";
  return "new";
}

export const atLeast = (l: Pick<Lead, "stage" | "status">, s: Stage) => RANK[stageOf(l)] >= RANK[s];

export class LimitError extends Error {}

/** Invoke an edge function; throws with the server's message, LimitError on 409 {code:'limit'}. */
export async function invokeFn<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let payload: { error?: string; code?: string } | null = null;
    if (error instanceof FunctionsHttpError) {
      payload = await error.context.json().catch(() => null);
      if (error.context.status === 409 && payload?.code === "limit") throw new LimitError(payload.error ?? "limit");
    }
    throw new Error(payload?.error ?? error.message);
  }
  if (data?.error) {
    if (data.code === "limit") throw new LimitError(data.error);
    throw new Error(data.error);
  }
  return data as T;
}

export const isLimitError = (e: unknown) =>
  e instanceof LimitError || (e instanceof Error && e.message.includes("WOB_LIMIT")) ||
  (typeof e === "object" && e !== null && "message" in e && String((e as { message: unknown }).message).includes("WOB_LIMIT"));

export const maskHash = (h: string) => (h.length <= 8 ? h : `•••• ${h.slice(-4).toUpperCase()}`);

export function useFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-SA" : "en-US";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return {
    money: (v: number | null | undefined, currency = "USD") =>
      v === null || v === undefined || !isFinite(v)
        ? "—"
        : new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(v),
    num: (v: number) => new Intl.NumberFormat(locale).format(v),
    pct: (v: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(v),
    ago: (iso: string) => {
      const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
      if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
      if (Math.abs(mins) < 1440) return rtf.format(Math.round(mins / 60), "hour");
      return rtf.format(Math.round(mins / 1440), "day");
    },
    date: (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
  };
}
