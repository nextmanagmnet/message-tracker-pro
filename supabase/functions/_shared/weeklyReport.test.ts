import { describe, expect, it } from "vitest";
import {
  buildReport,
  change,
  formatReport,
  isDue,
  localMidnight,
  normalizePhone,
  weekStats,
  weekWindows,
  type LeadRow,
} from "./weeklyReport";

const lead = (over: Partial<LeadRow>): LeadRow => ({
  stage: "new",
  status: "pending",
  order_status: null,
  order_value: null,
  order_currency: null,
  campaign_id: null,
  created_at: "2026-11-03T10:00:00Z",
  order_confirmed_at: null,
  ...over,
});

describe("schedule", () => {
  // 2026-11-02 is a Monday.
  const settings = { enabled: true, weekday: 1, hour: 9, timezone: "Asia/Beirut", last_sent_at: null };

  it("is due at the chosen local weekday and hour only", () => {
    expect(isDue(settings, new Date("2026-11-02T07:30:00Z"))).toBe(true); // 09:30 Beirut (UTC+2)
    expect(isDue(settings, new Date("2026-11-02T09:30:00Z"))).toBe(false);
    expect(isDue({ ...settings, enabled: false }, new Date("2026-11-02T07:30:00Z"))).toBe(false);
  });

  it("does not resend within six days", () => {
    const now = new Date("2026-11-02T07:30:00Z");
    expect(isDue({ ...settings, last_sent_at: "2026-11-02T07:00:00Z" }, now)).toBe(false);
    expect(isDue({ ...settings, last_sent_at: "2026-10-26T07:00:00Z" }, now)).toBe(true);
  });

  it("finds local midnight and full-day week windows", () => {
    expect(localMidnight(new Date("2026-11-02T07:30:00Z"), "Asia/Beirut").toISOString()).toBe(
      "2026-11-01T22:00:00.000Z",
    );
    expect(localMidnight(new Date("2026-11-02T07:30:00Z"), "Not/AZone").toISOString()).toBe("2026-11-02T00:00:00.000Z");
    const w = weekWindows(new Date("2026-11-02T07:30:00Z"), "Asia/Riyadh");
    expect(w.end.toISOString()).toBe("2026-11-01T21:00:00.000Z");
    expect(w.start.toISOString()).toBe("2026-10-25T21:00:00.000Z");
    expect(w.prevStart.toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });
});

describe("stats", () => {
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-11-08T00:00:00Z");

  it("counts the funnel and skips returned orders", () => {
    const s = weekStats(
      [
        lead({}),
        lead({ stage: null, status: "verified" }),
        lead({ stage: "qualified" }),
        lead({ stage: "client", order_value: 50, order_currency: "USD" }),
        lead({ stage: "client", order_value: 30, order_currency: "USD", order_status: "returned" }),
        lead({ stage: "client", order_value: 100, order_currency: "LBP" }),
        lead({ stage: "real", created_at: "2026-10-20T00:00:00Z" }),
      ],
      from,
      to,
    );
    expect(s).toEqual({
      chats: 6,
      real: 5,
      qualified: 4,
      orders: 2,
      revenue: [
        { currency: "LBP", amount: 100 },
        { currency: "USD", amount: 50 },
      ],
    });
  });

  it("dates orders by confirmation", () => {
    const old = lead({
      stage: "client",
      created_at: "2026-10-01T00:00:00Z",
      order_confirmed_at: "2026-11-02T00:00:00Z",
    });
    expect(weekStats([old], from, to).orders).toBe(1);
    expect(weekStats([old], from, to).chats).toBe(0);
  });
});

describe("message", () => {
  const now = new Date("2026-11-09T07:00:00Z");
  const leads = [
    lead({ stage: "qualified", campaign_id: "c1", created_at: "2026-11-05T10:00:00Z" }),
    lead({
      stage: "client",
      campaign_id: "c1",
      created_at: "2026-11-05T10:00:00Z",
      order_value: 60,
      order_currency: "USD",
    }),
    lead({ stage: "real", created_at: "2026-11-04T10:00:00Z" }),
    lead({ stage: "real", created_at: "2026-10-28T10:00:00Z" }),
  ];
  const report = buildReport(leads, [{ campaign_id: "c1", campaign_name: "Summer sale", spend: 20 }], now, "UTC");

  it("formats an English report with changes, costs and the best campaign", () => {
    const text = formatReport(report, "en");
    expect(text).toContain("• Chats: 3 (+200%)");
    expect(text).toContain("• Revenue: 60.00 USD");
    expect(text).toContain("• Cost per qualified lead: 10.00 USD");
    expect(text).toContain("🏆 Best campaign: Summer sale (2 qualified)");
    expect(text).toContain("https://wob-platform.vercel.app/");
  });

  it("formats Arabic with Arabic digits and isolated Latin names", () => {
    const text = formatReport(report, "ar", "رسالة");
    expect(text).toContain("• المحادثات: ٣ (+٢٠٠%)");
    expect(text).toContain("⁨Summer sale⁩");
    expect(text).toContain("💡 رسالة");
    expect(text).not.toMatch(/[0-9]/); // no Latin digits anywhere
  });

  it("leaves out change when there's no previous week", () => {
    expect(change(5, 0, "en")).toBe("");
    expect(change(5, 10, "en")).toBe(" (-50%)");
  });
});

describe("phone", () => {
  it("normalizes international numbers", () => {
    expect(normalizePhone("+961 79-393 810")).toBe("96179393810");
    expect(normalizePhone("00966501234567")).toBe("966501234567");
    expect(normalizePhone("12345")).toBeNull();
  });
});
