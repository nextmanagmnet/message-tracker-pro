import { describe, expect, it } from "vitest";
import { parseReview, reviewPlan, type PlanInput } from "./adReview";

const plan = (p: Partial<PlanInput> = {}): PlanInput => ({
  dailyBudget: 40,
  ageMin: 18,
  ageMax: 45,
  mediaCount: 2,
  texts: ["One", "Two"],
  message: "Hello, I want to order",
  balance: 500,
  costPerChat: null,
  ...p,
});
const codes = (p: Partial<PlanInput>) => reviewPlan(plan(p)).map((i) => i.code);

describe("reviewPlan", () => {
  it("is quiet about a sound plan", () => {
    expect(codes({})).toEqual([]);
  });

  it("warns about a budget too small to learn from", () => {
    expect(reviewPlan(plan({ dailyBudget: 20 }))[0]).toMatchObject({ code: "budget_low", level: "warn" });
  });

  it("works out from the account's own cost per chat what budget TikTok needs", () => {
    // $40/day at $2 a chat = 140 chats a week: fine. $20/day at $6 = ~23 a week: too few.
    expect(codes({ costPerChat: 2 })).toEqual([]);
    const slow = reviewPlan(plan({ dailyBudget: 40, costPerChat: 10 })).find((i) => i.code === "learning_slow");
    expect(slow?.values).toMatchObject({ chatsPerWeek: 28, needed: 50, budgetNeeded: 75 });
    expect(codes({ costPerChat: null })).toEqual([]);
  });

  it("warns when the budget is spread over too many ads", () => {
    const i = reviewPlan(plan({ dailyBudget: 30, mediaCount: 4, texts: ["a", "b", "c"] })).find(
      (x) => x.code === "too_many_ads",
    );
    expect(i).toMatchObject({ level: "warn", values: { ads: 12, perAd: 2.5 } });
  });

  it("suggests testing more than one video and text", () => {
    expect(codes({ mediaCount: 1, texts: ["Only"] })).toEqual(["few_videos", "few_texts"]);
  });

  it("notices a narrow audience, a short balance, hashtags and an empty first message", () => {
    expect(codes({ ageMin: 25, ageMax: 28 })).toContain("audience_narrow");
    expect(reviewPlan(plan({ balance: 50 })).find((i) => i.code === "balance_short")?.values).toEqual({ days: 1 });
    expect(codes({ texts: ["Buy now #sale", "ok"] })).toContain("text_style");
    expect(codes({ message: "hi" })).toContain("message_short");
  });
});

describe("parseReview", () => {
  it("keeps only usable parts of the advice", () => {
    const raw = JSON.stringify({
      summary: "  Solid, add a second video.  ",
      texts: ["Good text", "x".repeat(300), ""],
      message: "Hello!",
      daily_budget: 45.4,
    });
    expect(parseReview(raw, 500)).toEqual({
      summary: "Solid, add a second video.",
      texts: ["Good text"],
      message: "Hello!",
      dailyBudget: 45,
    });
  });

  it("never lets the model push the budget outside the allowed range", () => {
    const base = { summary: "ok", texts: [], message: "" };
    expect(parseReview(JSON.stringify({ ...base, daily_budget: 9 }), 500)?.dailyBudget).toBeNull();
    expect(parseReview(JSON.stringify({ ...base, daily_budget: 900 }), 500)?.dailyBudget).toBeNull();
  });

  it("returns null for nothing usable", () => {
    expect(parseReview(null, 500)).toBeNull();
    expect(parseReview("{}", 500)).toBeNull();
    expect(parseReview("nope", 500)).toBeNull();
  });
});
