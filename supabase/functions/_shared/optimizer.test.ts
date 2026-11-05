import { describe, expect, it } from "vitest";
import {
  dedupeKey,
  emptyMetrics,
  fallbackCopy,
  funnelBy,
  isReconnectError,
  nextBudget,
  parseCopy,
  parseReport,
  ruleHits,
  summarize,
  type Entity,
  type Metrics,
} from "./optimizer";

const m = (p: Partial<Metrics>): Metrics => ({ ...emptyMetrics(), ...p });
const entity = (p: Partial<Entity> & Pick<Entity, "level" | "id">): Entity => ({
  name: p.id,
  parentId: null,
  active: true,
  budget: null,
  dailyBudget: false,
  optimizationEvent: null,
  last7: emptyMetrics(),
  prev7: emptyMetrics(),
  wob: null,
  ...p,
});
const kinds = (es: Entity[]) => ruleHits(es).map((h) => `${h.kind}:${h.targetId}`);

describe("parseReport", () => {
  it("reads TikTok's string metrics", () => {
    const r = parseReport(
      [{ dimensions: { ad_id: "1" }, metrics: { spend: "4.33", clicks: "139", impressions: "9054", conversion: "9" } }],
      "ad_id",
    );
    expect(r.get("1")).toEqual({ spend: 4.33, clicks: 139, impressions: 9054, conversions: 9, purchases: 0 });
    expect(parseReport(null, "ad_id").size).toBe(0);
  });
});

describe("funnelBy", () => {
  it("counts each stage cumulatively and revenue from clients", () => {
    const f = funnelBy(
      [
        { campaign_id: "c", stage: "new", order_value: null },
        { campaign_id: "c", stage: "qualified", order_value: null },
        { campaign_id: "c", stage: "client", order_value: 30 },
        { campaign_id: "c", stage: "not_lead", order_value: null },
        { campaign_id: null, stage: "client", order_value: 99 },
      ],
      "campaign_id",
    );
    expect(f.get("c")).toEqual({ chats: 4, real: 2, qualified: 2, clients: 1, revenue: 30 });
    expect(f.size).toBe(1);
  });
});

describe("nextBudget", () => {
  it("caps the step at 30% and never goes under $20", () => {
    expect(nextBudget(50, 0.2)).toBe(60);
    expect(nextBudget(50, 0.9)).toBe(65);
    expect(nextBudget(22, -0.2)).toBe(20);
  });
});

describe("pause rule", () => {
  const sibling = entity({ level: "ad", id: "good", parentId: "g", last7: m({ spend: 20, conversions: 4 }) });
  it("pauses a spending ad with no qualified leads while a sibling has some", () => {
    expect(kinds([sibling, entity({ level: "ad", id: "bad", parentId: "g", last7: m({ spend: 25 }) })])).toEqual([
      "pause:bad",
    ]);
  });
  it("waits below the minimum spend", () => {
    expect(kinds([sibling, entity({ level: "ad", id: "bad", parentId: "g", last7: m({ spend: 19 }) })])).toEqual([]);
  });
  it("does not pause when no sibling converts either", () => {
    const dud = entity({ level: "ad", id: "dud", parentId: "g", last7: m({ spend: 30 }) });
    expect(kinds([dud, entity({ level: "ad", id: "bad", parentId: "g", last7: m({ spend: 30 }) })])).toEqual([]);
  });
  it("prefers WOB's own qualified count over TikTok's", () => {
    const bad = entity({
      level: "ad",
      id: "bad",
      parentId: "g",
      last7: m({ spend: 30 }),
      wob: { chats: 3, real: 2, qualified: 1, clients: 0, revenue: 0 },
    });
    expect(kinds([sibling, bad])).toEqual([]);
  });
});

describe("budget rules", () => {
  const group = (id: string, spend: number, conversions: number, budget = 50) =>
    entity({ level: "adgroup", id, dailyBudget: true, budget, last7: m({ spend, conversions }) });
  it("raises a cheap ad group by 20% and lowers an expensive one", () => {
    const hits = ruleHits([group("cheap", 50, 10), group("mid", 200, 10), group("pricey", 100, 1)]);
    // Account average: 350 / 21 = 16.7; cheap = 5, pricey = 100.
    expect(hits.map((h) => `${h.kind}:${h.targetId}`)).toEqual(["increase_budget:cheap", "decrease_budget:pricey"]);
    expect(hits[0].action).toMatchObject({ type: "budget", from: 50, to: 60 });
  });
  it("needs enough qualified leads to scale", () => {
    expect(kinds([group("cheap", 20, 4), group("mid", 200, 10)])).toEqual([]);
  });
  it("leaves lifetime budgets alone", () => {
    const g = { ...group("cheap", 50, 10), dailyBudget: false };
    expect(kinds([g, group("mid", 200, 10)])).toEqual([]);
  });
});

describe("switch_event rule", () => {
  const g = (purchases: number, optimizationEvent = "FORM") =>
    entity({ level: "adgroup", id: "g", optimizationEvent, last7: m({ spend: 30, purchases }) });
  it("suggests Purchase at 50 purchases a week, explains otherwise", () => {
    expect(kinds([g(50)])).toEqual(["switch_event:g"]);
    expect(ruleHits([g(12)])[0]).toMatchObject({ kind: "other", action: { topic: "switch_event_not_yet" } });
    expect(kinds([g(0)])).toEqual([]);
    expect(kinds([g(80, "SHOPPING")])).toEqual([]);
  });
});

describe("refresh_creative rule", () => {
  const ad = (nowClicks: number) =>
    entity({
      level: "ad",
      id: "a",
      last7: m({ impressions: 5000, clicks: nowClicks }),
      prev7: m({ impressions: 5000, clicks: 100 }),
    });
  it("fires on a 40% CTR drop only", () => {
    expect(kinds([ad(55)])).toEqual(["refresh_creative:a"]);
    expect(kinds([ad(70)])).toEqual([]);
  });
});

describe("helpers", () => {
  it("dedupes on level, target and kind", () => {
    expect(dedupeKey({ level: "ad", target_id: "1", kind: "pause" })).toBe("ad:1:pause");
  });
  it("spots reconnect errors", () => {
    expect(isReconnectError(40105, "Access token is invalid")).toBe(true);
    expect(isReconnectError(40002, "No permission to operate advertiser")).toBe(true);
    expect(isReconnectError(40002, "budget too low")).toBe(false);
  });
  it("parses model copy and drops bad items", () => {
    const raw = JSON.stringify({
      items: [
        { index: 1, title: " T ", rationale: "R" },
        { index: 9, title: "x" },
      ],
    });
    expect(parseCopy(raw, 2)).toEqual([null, { title: "T", rationale: "R" }]);
    expect(parseCopy("not json", 1)).toEqual([null]);
  });
  it("falls back to templates in both languages", () => {
    const [hit] = ruleHits([
      entity({ level: "adgroup", id: "g", name: "Beirut", last7: m({ spend: 30, purchases: 3 }) }),
    ]);
    expect(fallbackCopy(hit, "en").title).toContain("Not yet");
    expect(fallbackCopy(hit, "ar").title).toContain("Beirut");
  });
});

describe("early warnings", () => {
  const ad = (p: Partial<Entity>) => entity({ level: "ad", id: "a", parentId: "g", ...p });
  const group = (p: Partial<Entity>) => entity({ level: "adgroup", id: "g", ...p });
  const topics = (es: Entity[], chats: number | null = null) =>
    ruleHits(es, chats).map((h) => `${h.action.topic ?? h.kind}:${h.targetId}`);

  it("flags an ad group that was showing and stopped", () => {
    expect(topics([group({ prev7: m({ impressions: 5000 }) })])).toContain("not_delivering:g");
    // a brand-new group has no history: not flagged
    expect(topics([group({})])).toEqual([]);
    // a paused one is not flagged
    expect(topics([group({ active: false, prev7: m({ impressions: 5000 }) })])).toEqual([]);
  });

  it("flags clicks that bring no chats, once, only when chats are known to be zero", () => {
    const g = group({ last7: m({ spend: 18, clicks: 60, impressions: 4000 }) });
    expect(topics([g], 0)).toContain("no_chats:g");
    expect(topics([g], 3)).not.toContain("no_chats:g");
    expect(topics([g], null)).not.toContain("no_chats:g");
    expect(topics([group({ last7: m({ spend: 5, clicks: 60 }) })], 0)).toEqual([]);
  });

  it("flags a video that is weak outright, even with no history", () => {
    expect(topics([ad({ last7: m({ impressions: 5000, clicks: 5 }) })])).toContain("refresh_creative:a");
    expect(topics([ad({ last7: m({ impressions: 5000, clicks: 80 }) })])).toEqual([]);
    expect(topics([ad({ last7: m({ impressions: 500, clicks: 0 }) })])).toEqual([]);
  });

  it("summarizes what was looked at", () => {
    const s = summarize([group({ last7: m({ spend: 25, clicks: 10, impressions: 900 }) }), ad({})], 4);
    expect(s).toMatchObject({ activeGroups: 1, activeAds: 1, spend: 25, chats: 4, judged: 1 });
  });
});
