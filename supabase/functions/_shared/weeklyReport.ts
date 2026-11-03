// Weekly WhatsApp report to the business owner: schedule, stats and message text.
// Pure helpers (no imports) so they run under Deno and Vitest alike.

export type Lang = "en" | "ar";

export type ReportSettings = {
  enabled: boolean;
  weekday: number; // 0 = Sunday
  hour: number;
  timezone: string;
  last_sent_at: string | null;
};

export type LeadRow = {
  stage: string | null;
  status: string;
  order_status: string | null;
  order_value: number | null;
  order_currency: string | null;
  campaign_id: string | null;
  created_at: string;
  order_confirmed_at: string | null;
};

export type CampaignRow = { campaign_id: string; campaign_name: string | null; spend: number | null };

export type WeekStats = {
  chats: number;
  real: number;
  qualified: number;
  orders: number;
  revenue: Array<{ currency: string; amount: number }>; // largest first
};

export type Report = {
  current: WeekStats;
  previous: WeekStats;
  spend: number; // USD, rolling 7 days from the campaign sync
  best: { name: string; qualified: number } | null;
};

export const DASHBOARD_URL = "https://wob-platform.vercel.app/";
const DAY = 86_400_000;
const RESEND_GAP = 6 * DAY;

// ---------- Time zones ----------

/** Wall-clock parts of `at` in `tz` (falls back to UTC on a bad zone). */
export function zonedParts(at: Date, tz: string) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    return zonedParts(at, "UTC");
  }
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

/** UTC instant of local midnight (start of the local day containing `at`). */
export function localMidnight(at: Date, tz: string): Date {
  const p = zonedParts(at, tz);
  const offset =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
  // ponytail: uses the offset at `at`; off by an hour only when a DST switch falls between midnight and now.
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset);
}

/** The last 7 full local days before today, and the 7 days before that. */
export function weekWindows(now: Date, tz: string) {
  const end = localMidnight(now, tz);
  const start = localMidnight(new Date(end.getTime() - 7 * DAY + 12 * 3_600_000), tz);
  const prevStart = localMidnight(new Date(start.getTime() - 7 * DAY + 12 * 3_600_000), tz);
  return { prevStart, start, end };
}

/** True when the cron run at `now` should send this client's report. */
export function isDue(s: ReportSettings, now: Date): boolean {
  if (!s.enabled) return false;
  const p = zonedParts(now, s.timezone);
  if (p.weekday !== s.weekday || p.hour !== s.hour) return false;
  return !s.last_sent_at || now.getTime() - new Date(s.last_sent_at).getTime() > RESEND_GAP;
}

// ---------- Stats ----------

const RANK: Record<string, number> = { not_lead: -1, new: 0, real: 1, qualified: 2, client: 3 };

// Same fallback as the app: legacy leads without a stage use the rule-based status.
function rank(l: Pick<LeadRow, "stage" | "status">): number {
  if (l.stage) return RANK[l.stage] ?? 0;
  return l.status === "verified" ? 1 : l.status === "trash" ? -1 : 0;
}

const inRange = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

const isOrder = (l: LeadRow) => l.stage === "client" && l.order_status !== "returned";

/** Chats by creation date; orders/revenue by confirmation date (creation date for older orders). */
export function weekStats(leads: LeadRow[], from: Date, to: Date): WeekStats {
  const started = leads.filter((l) => inRange(l.created_at, from, to));
  const orders = leads.filter((l) => isOrder(l) && inRange(l.order_confirmed_at ?? l.created_at, from, to));
  const byCurrency = new Map<string, number>();
  for (const o of orders) {
    if (o.order_value == null || !o.order_currency) continue;
    byCurrency.set(o.order_currency, (byCurrency.get(o.order_currency) ?? 0) + Number(o.order_value));
  }
  return {
    chats: started.length,
    real: started.filter((l) => rank(l) >= 1).length,
    qualified: started.filter((l) => rank(l) >= 2).length,
    orders: orders.length,
    revenue: [...byCurrency].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export function buildReport(leads: LeadRow[], campaigns: CampaignRow[], now: Date, tz: string): Report {
  const { prevStart, start, end } = weekWindows(now, tz);
  const counts = new Map<string, number>();
  for (const l of leads) {
    if (l.campaign_id && rank(l) >= 2 && inRange(l.created_at, start, end))
      counts.set(l.campaign_id, (counts.get(l.campaign_id) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const name = top && (campaigns.find((c) => c.campaign_id === top[0])?.campaign_name || top[0]);
  return {
    current: weekStats(leads, start, end),
    previous: weekStats(leads, prevStart, start),
    spend: campaigns.reduce((s, c) => s + (Number(c.spend) || 0), 0),
    best: top && name ? { name, qualified: top[1] } : null,
  };
}

// ---------- Message ----------

const TEXT = {
  en: {
    title: "📊 *Your week on WOB*",
    chats: "Chats",
    real: "Real conversations",
    qualified: "Qualified leads",
    orders: "Orders",
    revenue: "Revenue",
    also: "also",
    spend: "Ad spend",
    cpl: "Cost per qualified lead",
    cpo: "Cost per order",
    best: "Best campaign",
    qualifiedShort: "qualified",
    vs: "vs last week",
    dashboard: "Full dashboard",
  },
  ar: {
    title: "📊 *أسبوعك على WOB*",
    chats: "المحادثات",
    real: "محادثات حقيقية",
    qualified: "عملاء محتملون مؤهلون",
    orders: "الطلبات",
    revenue: "الإيرادات",
    also: "وأيضًا",
    spend: "الإنفاق الإعلاني",
    cpl: "تكلفة العميل المؤهل",
    cpo: "تكلفة الطلب",
    best: "أفضل حملة",
    qualifiedShort: "مؤهل",
    vs: "مقارنة بالأسبوع الماضي",
    dashboard: "لوحة التحكم الكاملة",
  },
} as const;

// Arabic messages use Arabic-Indic digits, so numbers never flip inside RTL text.
export function num(n: number, lang: Lang, decimals = 0): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-u-nu-arab" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

// Isolate Latin text (campaign names, currency codes) so it can't reorder the Arabic around it.
const iso = (s: string, lang: Lang) => (lang === "ar" ? `⁨${s}⁩` : s);

const money = (n: number, currency: string, lang: Lang) => `${num(n, lang, 2)} ${iso(currency, lang)}`;

/** "+20%" style week-over-week change; empty when there's no base to compare with. */
export function change(cur: number, prev: number, lang: Lang): string {
  if (prev <= 0) return "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "±";
  return ` (${sign}${num(Math.abs(pct), lang)}%)`;
}

export function formatReport(r: Report, lang: Lang, insight?: string | null): string {
  const t = TEXT[lang];
  const { current: c, previous: p } = r;
  const line = (label: string, cur: number, prev: number) => `• ${label}: ${num(cur, lang)}${change(cur, prev, lang)}`;
  const lines = [
    t.title,
    "",
    line(t.chats, c.chats, p.chats),
    line(t.real, c.real, p.real),
    line(t.qualified, c.qualified, p.qualified),
    line(t.orders, c.orders, p.orders),
  ];
  const [main, ...others] = c.revenue;
  if (main) {
    const prevMain = p.revenue.find((x) => x.currency === main.currency)?.amount ?? 0;
    let rev = `• ${t.revenue}: ${money(main.amount, main.currency, lang)}${change(main.amount, prevMain, lang)}`;
    if (others.length)
      rev += ` (${t.also} ${others.map((o) => money(o.amount, o.currency, lang)).join(lang === "ar" ? "، " : ", ")})`;
    lines.push(rev);
  }
  if (r.spend > 0) {
    lines.push("", `• ${t.spend}: ${money(r.spend, "USD", lang)}`);
    if (c.qualified > 0) lines.push(`• ${t.cpl}: ${money(r.spend / c.qualified, "USD", lang)}`);
    if (c.orders > 0) lines.push(`• ${t.cpo}: ${money(r.spend / c.orders, "USD", lang)}`);
  }
  if (r.best)
    lines.push(`🏆 ${t.best}: ${iso(r.best.name, lang)} (${num(r.best.qualified, lang)} ${t.qualifiedShort})`);
  if (insight) lines.push("", `💡 ${insight}`);
  lines.push("");
  if (lines.some((l) => l.includes("%)"))) lines.push(`(%) ${t.vs}`);
  lines.push(`${t.dashboard}: ${DASHBOARD_URL}`);
  return lines.join("\n");
}

/** Enough activity for an AI one-liner to say something real. */
export const worthInsight = (r: Report) => r.current.chats + r.previous.chats >= 10;

// ---------- Sending ----------

/** "+961 79-393 810" -> "96179393810"; null when it isn't a plausible international number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw
    .replace(/[\s\-().]/g, "")
    .replace(/^\+/, "")
    .replace(/^00/, "");
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null;
}

/**
 * Sends a plain text from an Evolution line to any number (sendWhatsAppText only replies inside
 * an existing conversation). Same endpoint and auth as whatsappSend.ts.
 */
export async function sendEvolutionText(
  cfg: { baseUrl: string; apiKey: string; instance: string },
  phone: string,
  text: string,
): Promise<boolean> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/message/sendText/${cfg.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) console.error("Evolution weekly report send failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}
