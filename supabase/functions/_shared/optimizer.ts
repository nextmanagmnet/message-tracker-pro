// Campaign optimizer rules: deterministic, conservative, and only suggestions. The AI writes the wording,
// never the decision. Pure logic (no Deno APIs) so it is unit-tested with Vitest.

export type Level = "campaign" | "adgroup" | "ad";
export type Kind = "pause" | "increase_budget" | "decrease_budget" | "switch_event" | "refresh_creative" | "other";
export type Lang = "en" | "ar";

export interface Metrics {
  spend: number;
  clicks: number;
  impressions: number;
  /** Results of the ad group's own optimization event, as TikTok counts them. */
  conversions: number;
  /** Purchase (CompletePayment) events TikTok attributed. */
  purchases: number;
}

/** WOB's own funnel from the chats it read. */
export interface Funnel {
  chats: number;
  real: number;
  qualified: number;
  clients: number;
  revenue: number;
}

export interface Entity {
  level: Level;
  id: string;
  name: string;
  /** Ad group for an ad, campaign for an ad group. */
  parentId: string | null;
  active: boolean;
  budget: number | null;
  /** Only daily budgets are changed. */
  dailyBudget: boolean;
  optimizationEvent: string | null;
  last7: Metrics;
  prev7: Metrics;
  /** WOB's funnel, when chats can be tied to this object. */
  wob: Funnel | null;
}

export interface Hit {
  level: Level;
  targetId: string;
  name: string;
  kind: Kind;
  /** What Apply executes (or the guidance shown), plus the numbers behind it. */
  action: Record<string, unknown>;
}

// Conservative thresholds: never judge on small spend.
export const MIN_SPEND = 20; // USD in the last 7 days before anything is judged
export const MIN_QUALIFIED_FOR_SCALE = 5;
export const CHEAP_RATIO = 0.7; // cost per qualified lead at most 70% of the account average
export const EXPENSIVE_RATIO = 2; // at least twice the account average
export const BUDGET_STEP = 0.2;
export const MAX_BUDGET_STEP = 0.3;
export const MIN_DAILY_BUDGET = 20; // TikTok's minimum ad group daily budget (USD)
export const PURCHASES_TO_SWITCH = 50; // TikTok needs ~50 conversions a week to learn an event
export const MIN_IMPRESSIONS_FOR_CTR = 3000;
export const CTR_DROP = 0.4; // CTR fell by 40% or more week over week
export const LOW_CTR = 0.003; // an ad seen 3000+ times and clicked under 0.3% is weak whatever last week looked like
export const MIN_SPEND_NO_CHATS = 15; // clicks that bought nothing are worth a warning earlier than a full judgement
export const MIN_CLICKS_NO_CHATS = 40;

const PURCHASE_EVENTS = new Set(["SHOPPING", "COMPLETE_PAYMENT"]);

export const emptyMetrics = (): Metrics => ({ spend: 0, clicks: 0, impressions: 0, conversions: 0, purchases: 0 });
export const emptyFunnel = (): Funnel => ({ chats: 0, real: 0, qualified: 0, clients: 0, revenue: 0 });

/** Qualified leads: WOB's own count when chats are tied to the object, else TikTok's optimization-event results. */
export const qualifiedOf = (e: Entity) => e.wob?.qualified ?? e.last7.conversions;

const ctr = (m: Metrics) => (m.impressions > 0 ? m.clicks / m.impressions : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** report/integrated/get rows -> metrics by the given dimension id. */
export function parseReport(list: unknown, idKey: string): Map<string, Metrics> {
  const out = new Map<string, Metrics>();
  if (!Array.isArray(list)) return out;
  for (const row of list as Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }>) {
    const id = row.dimensions?.[idKey];
    if (!id) continue;
    const m = row.metrics ?? {};
    const num = (k: string) => Number(m[k]) || 0;
    out.set(id, {
      spend: num("spend"),
      clicks: num("clicks"),
      impressions: num("impressions"),
      conversions: num("conversion"),
      purchases: num("complete_payment"),
    });
  }
  return out;
}

const RANK: Record<string, number> = { not_lead: -1, new: 0, real: 1, qualified: 2, client: 3 };

/** Leads -> WOB funnel keyed by the given field (campaign_id or ad_id). Legacy leads without a stage count as new. */
export function funnelBy(
  leads: Array<{ stage: string | null; order_value: number | null } & Record<string, unknown>>,
  key: "campaign_id" | "ad_id",
): Map<string, Funnel> {
  const out = new Map<string, Funnel>();
  for (const l of leads) {
    const id = l[key];
    if (typeof id !== "string" || !id) continue;
    const f = out.get(id) ?? emptyFunnel();
    const rank = RANK[l.stage ?? "new"] ?? 0;
    f.chats++;
    if (rank >= 1) f.real++;
    if (rank >= 2) f.qualified++;
    if (rank >= 3) {
      f.clients++;
      f.revenue += Number(l.order_value) || 0;
    }
    out.set(id, f);
  }
  return out;
}

/** New daily budget for a step of pct (sign = direction), capped at ±30% and never under TikTok's minimum. */
export function nextBudget(current: number, pct: number): number {
  const step = Math.max(-MAX_BUDGET_STEP, Math.min(MAX_BUDGET_STEP, pct));
  return round2(Math.max(MIN_DAILY_BUDGET, current * (1 + step)));
}

/** Account average cost per qualified lead over ad groups with spend and qualified leads; null if unknown. */
export function accountCpq(adgroups: Entity[]): number | null {
  let spend = 0;
  let qualified = 0;
  for (const g of adgroups) {
    spend += g.last7.spend;
    qualified += qualifiedOf(g);
  }
  return qualified > 0 ? spend / qualified : null;
}

/** What the analysis looked at, so an empty result can say why it is empty. */
export interface Summary {
  activeGroups: number;
  activeAds: number;
  spend: number;
  clicks: number;
  impressions: number;
  /** Chats WOB read from TikTok ads in the same 7 days. */
  chats: number;
  /** Active ad groups that spent enough to be judged. */
  judged: number;
  minSpend: number;
}

export function summarize(entities: Entity[], chats: number): Summary {
  const groups = entities.filter((e) => e.level === "adgroup");
  const active = groups.filter((g) => g.active);
  return {
    activeGroups: active.length,
    activeAds: entities.filter((e) => e.level === "ad" && e.active).length,
    spend: round2(groups.reduce((n, g) => n + g.last7.spend, 0)),
    clicks: groups.reduce((n, g) => n + g.last7.clicks, 0),
    impressions: groups.reduce((n, g) => n + g.last7.impressions, 0),
    chats,
    judged: active.filter((g) => g.last7.spend >= MIN_SPEND).length,
    minSpend: MIN_SPEND,
  };
}

/** `accountChats`: chats WOB read from this account's ads in the last 7 days (null = unknown, skip that rule). */
export function ruleHits(entities: Entity[], accountChats: number | null = null): Hit[] {
  const hits: Hit[] = [];
  const adgroups = entities.filter((e) => e.level === "adgroup");
  const ads = entities.filter((e) => e.level === "ad");
  const avg = accountCpq(adgroups);

  // Pause an ad that spent and brought no qualified leads while its siblings did.
  for (const ad of ads) {
    if (!ad.active || ad.last7.spend < MIN_SPEND || qualifiedOf(ad) > 0) continue;
    const siblings = ads.filter((s) => s.parentId === ad.parentId && s.id !== ad.id && s.active);
    const sibQualified = siblings.reduce((n, s) => n + qualifiedOf(s), 0);
    if (sibQualified === 0) continue;
    const sibCpq = siblings.reduce((n, s) => n + s.last7.spend, 0) / sibQualified;
    // Wait until it has spent at least 1.5x what a sibling pays per qualified lead.
    if (ad.last7.spend < 1.5 * sibCpq) continue;
    hits.push({
      level: "ad",
      targetId: ad.id,
      name: ad.name,
      kind: "pause",
      action: {
        type: "pause",
        numbers: {
          spend: round2(ad.last7.spend),
          qualified: 0,
          siblingQualified: sibQualified,
          siblingCpq: round2(sibCpq),
        },
      },
    });
  }

  for (const g of adgroups) {
    if (!g.active || g.last7.spend < MIN_SPEND) continue;
    const q = qualifiedOf(g);
    const cpq = q > 0 ? g.last7.spend / q : null;
    const numbers = {
      spend: round2(g.last7.spend),
      qualified: q,
      cpq: cpq === null ? null : round2(cpq),
      accountCpq: avg === null ? null : round2(avg),
      budget: g.budget,
    };
    // Budget moves only for daily budgets above which TikTok still accepts a change.
    if (g.dailyBudget && g.budget && avg !== null && cpq !== null) {
      if (q >= MIN_QUALIFIED_FOR_SCALE && cpq <= CHEAP_RATIO * avg) {
        hits.push({
          level: "adgroup",
          targetId: g.id,
          name: g.name,
          kind: "increase_budget",
          action: { type: "budget", pct: BUDGET_STEP, from: g.budget, to: nextBudget(g.budget, BUDGET_STEP), numbers },
        });
      } else if (cpq >= EXPENSIVE_RATIO * avg && g.budget > MIN_DAILY_BUDGET) {
        hits.push({
          level: "adgroup",
          targetId: g.id,
          name: g.name,
          kind: "decrease_budget",
          action: {
            type: "budget",
            pct: -BUDGET_STEP,
            from: g.budget,
            to: nextBudget(g.budget, -BUDGET_STEP),
            numbers,
          },
        });
      }
    }

    // Optimizing for Purchase only works with enough purchases for TikTok to learn from.
    const purchases = g.last7.purchases;
    if (!PURCHASE_EVENTS.has(g.optimizationEvent ?? "") && purchases > 0) {
      const ready = purchases >= PURCHASES_TO_SWITCH;
      hits.push({
        level: "adgroup",
        targetId: g.id,
        name: g.name,
        kind: ready ? "switch_event" : "other",
        action: {
          type: "guidance",
          topic: ready ? "switch_event" : "switch_event_not_yet",
          numbers: { purchases, needed: PURCHASES_TO_SWITCH, currentEvent: g.optimizationEvent },
        },
      });
    }
  }

  // An ad group that was delivering and stopped: usually an empty balance, a rejected ad or an ended schedule.
  for (const g of adgroups) {
    if (!g.active || g.last7.impressions > 0 || g.prev7.impressions === 0) continue;
    hits.push({
      level: "adgroup",
      targetId: g.id,
      name: g.name,
      kind: "other",
      action: {
        type: "guidance",
        topic: "not_delivering",
        numbers: { previousImpressions: g.prev7.impressions, impressions: 0, budget: g.budget },
      },
    });
  }

  // People click but nobody starts a chat: the problem is after the click (link, WhatsApp number, first message).
  if (accountChats === 0) {
    const top = adgroups
      .filter((g) => g.active && g.last7.spend >= MIN_SPEND_NO_CHATS && g.last7.clicks >= MIN_CLICKS_NO_CHATS)
      .sort((a, b) => b.last7.spend - a.last7.spend)[0];
    if (top)
      hits.push({
        level: "adgroup",
        targetId: top.id,
        name: top.name,
        kind: "other",
        action: {
          type: "guidance",
          topic: "no_chats",
          numbers: { spend: round2(top.last7.spend), clicks: top.last7.clicks, chats: 0 },
        },
      });
  }

  // Refresh a creative that is weak outright, or whose click-through rate fell sharply week over week.
  for (const ad of ads) {
    if (!ad.active || ad.last7.impressions < MIN_IMPRESSIONS_FOR_CTR) continue;
    const now = ctr(ad.last7);
    const before = ad.prev7.impressions >= MIN_IMPRESSIONS_FOR_CTR ? ctr(ad.prev7) : 0;
    const dropped = before > 0 && now <= (1 - CTR_DROP) * before;
    if (!dropped && now >= LOW_CTR) continue;
    hits.push({
      level: "ad",
      targetId: ad.id,
      name: ad.name,
      kind: "refresh_creative",
      action: {
        type: "guidance",
        topic: "refresh_creative",
        numbers: {
          ctr: round2(now * 100),
          previousCtr: before > 0 ? round2(before * 100) : null,
          impressions: ad.last7.impressions,
        },
      },
    });
  }
  return hits;
}

export const dedupeKey = (r: { level: string; target_id: string; kind: string }) =>
  `${r.level}:${r.target_id}:${r.kind}`;

/** Token or scope problems mean the client must reconnect TikTok. */
export function isReconnectError(code: number, message: string): boolean {
  return [40001, 40104, 40105].includes(code) || /permission|scope|access.?token|authori[sz]/i.test(message);
}

export interface Copy {
  title: string;
  rationale: string;
}

/** Validates the model's {items:[{index,title,rationale}]} output; missing items fall back to templates. */
export function parseCopy(raw: string | null, count: number): Array<Copy | null> {
  const out: Array<Copy | null> = Array.from({ length: count }, () => null);
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as { items?: Array<{ index?: unknown; title?: unknown; rationale?: unknown }> };
    for (const it of parsed.items ?? []) {
      const i = Number(it.index);
      if (!Number.isInteger(i) || i < 0 || i >= count) continue;
      if (typeof it.title !== "string" || typeof it.rationale !== "string") continue;
      const title = it.title.trim().slice(0, 120);
      const rationale = it.rationale.trim().slice(0, 600);
      if (title && rationale) out[i] = { title, rationale };
    }
  } catch {
    // unreadable output: templates are used
  }
  return out;
}

const TITLES: Record<Lang, Record<string, string>> = {
  en: {
    pause: "Pause ad “{name}”",
    increase_budget: "Raise the budget of “{name}”",
    decrease_budget: "Lower the budget of “{name}”",
    switch_event: "Optimize “{name}” for purchases",
    switch_event_not_yet: "Not yet time to optimize “{name}” for purchases",
    refresh_creative: "Refresh the video of “{name}”",
    not_delivering: "“{name}” stopped showing",
    no_chats: "Clicks on “{name}” are not turning into chats",
  },
  ar: {
    pause: "إيقاف الإعلان «{name}»",
    increase_budget: "زيادة ميزانية «{name}»",
    decrease_budget: "تخفيض ميزانية «{name}»",
    switch_event: "تحسين «{name}» للمشتريات",
    switch_event_not_yet: "لم يحن الوقت بعد لتحسين «{name}» للمشتريات",
    refresh_creative: "تجديد فيديو «{name}»",
    not_delivering: "«{name}» توقف عن الظهور",
    no_chats: "النقرات على «{name}» لا تتحول إلى محادثات",
  },
};

/** Plain template wording when the AI is unavailable. */
export function fallbackCopy(hit: Hit, lang: Lang): Copy {
  const topic = typeof hit.action.topic === "string" ? hit.action.topic : hit.kind;
  const title = (TITLES[lang][topic] ?? TITLES[lang][hit.kind] ?? hit.kind).replace("{name}", hit.name);
  const numbers = Object.entries((hit.action.numbers ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return { title, rationale: numbers };
}
