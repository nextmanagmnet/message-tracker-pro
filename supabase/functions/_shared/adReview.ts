// The "media buyer" check on a campaign before it launches. Deterministic rules find the problems (so the same plan
// always gets the same warnings and the numbers are never invented); the AI only words the advice and may offer
// better ad texts / first message / budget, which the person applies or ignores. Pure (no Deno APIs) for Vitest.

import { MAX_AD_TEXT, MIN_DAILY_BUDGET } from "./tiktokAds.ts";

export const RESULTS_PER_WEEK = 50; // TikTok needs about this many results a week to learn an optimization event
export const SAFE_BUDGET = 30; // below this, learning is slow on most accounts
export const MIN_PER_AD = 5; // daily budget each ad needs to get a fair test

export interface PlanInput {
  dailyBudget: number;
  ageMin: number;
  ageMax: number;
  mediaCount: number;
  texts: string[];
  message: string;
  /** Ad account balance, when known. */
  balance: number | null;
  /** Account's own last-7-day cost of a chat, when there are enough chats to know it. */
  costPerChat: number | null;
}

export interface Issue {
  code: string;
  level: "warn" | "tip";
  values?: Record<string, number>;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function reviewPlan(p: PlanInput): Issue[] {
  const out: Issue[] = [];
  const ads = Math.max(0, p.mediaCount) * Math.max(0, p.texts.length);

  if (p.dailyBudget < SAFE_BUDGET) out.push({ code: "budget_low", level: "warn", values: { budget: p.dailyBudget } });
  if (p.costPerChat && p.costPerChat > 0) {
    const perWeek = (p.dailyBudget / p.costPerChat) * 7;
    if (perWeek < RESULTS_PER_WEEK)
      out.push({
        code: "learning_slow",
        level: "tip",
        values: {
          chatsPerWeek: Math.round(perWeek),
          needed: RESULTS_PER_WEEK,
          budgetNeeded: Math.max(MIN_DAILY_BUDGET, Math.ceil(((RESULTS_PER_WEEK / 7) * p.costPerChat) / 5) * 5),
        },
      });
  }
  if (ads > 1 && p.dailyBudget / ads < MIN_PER_AD)
    out.push({ code: "too_many_ads", level: "warn", values: { ads, perAd: round(p.dailyBudget / ads) } });
  if (p.mediaCount < 2) out.push({ code: "few_videos", level: "tip" });
  if (p.texts.length < 2) out.push({ code: "few_texts", level: "tip" });
  if (p.ageMax - p.ageMin < 7)
    out.push({ code: "audience_narrow", level: "tip", values: { span: p.ageMax - p.ageMin } });
  if (p.balance !== null && p.dailyBudget > 0 && p.balance < p.dailyBudget * 3)
    out.push({
      code: "balance_short",
      level: "tip",
      values: { days: Math.max(0, Math.floor(p.balance / p.dailyBudget)) },
    });
  if (p.texts.some((t) => /#|!{2,}/.test(t))) out.push({ code: "text_style", level: "tip" });
  if (p.message.trim().length < 6) out.push({ code: "message_short", level: "tip" });
  return out;
}

export interface ReviewAdvice {
  summary: string;
  texts: string[] | null;
  message: string | null;
  dailyBudget: number | null;
}

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    texts: { type: "array", items: { type: "string" } },
    message: { type: "string" },
    daily_budget: { type: "number" },
  },
  required: ["summary", "texts", "message", "daily_budget"],
  additionalProperties: false,
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Validates the model's advice. Anything unusable becomes null, so a bad answer can never change the plan. */
export function parseReview(raw: string | null, cap: number): ReviewAdvice | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw ?? "");
  } catch {
    return null;
  }
  const summary = str(d?.summary).slice(0, 600);
  if (!summary) return null;
  const texts = (Array.isArray(d.texts) ? d.texts : [])
    .map(str)
    .filter((t) => t && t.length <= MAX_AD_TEXT)
    .slice(0, 3);
  const message = str(d.message).slice(0, 300);
  const budget = Number(d.daily_budget);
  return {
    summary,
    texts: texts.length ? texts : null,
    message: message || null,
    dailyBudget: Number.isFinite(budget) && budget >= MIN_DAILY_BUDGET && budget <= cap ? Math.round(budget) : null,
  };
}
