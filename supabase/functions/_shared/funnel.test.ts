import { describe, expect, it } from "vitest";
import {
  buildMetaPayload,
  buildTikTokPayload,
  canAdvance,
  eventIdFor,
  eventNameFor,
  extractCampaignCode,
  extractClidFromText,
  isFollowUpEligible,
  isOptOut,
  parseAdContext,
  parseAnalysis,
  type FollowUpInput,
} from "./funnel";

describe("canAdvance", () => {
  it("only moves forward", () => {
    expect(canAdvance("new", "real")).toBe(true);
    expect(canAdvance(null, "qualified")).toBe(true);
    expect(canAdvance("qualified", "real")).toBe(false);
    expect(canAdvance("client", "client")).toBe(false);
    expect(canAdvance("real", "client")).toBe(true);
  });
  it("not_lead is terminal", () => {
    expect(canAdvance("qualified", "not_lead")).toBe(true);
    expect(canAdvance("not_lead", "client")).toBe(false);
    expect(canAdvance("not_lead", "not_lead")).toBe(false);
  });
});

describe("event mapping", () => {
  it("maps stages per platform", () => {
    expect(eventNameFor("tiktok", "qualified")).toBe("SubmitForm");
    expect(eventNameFor("meta", "qualified")).toBe("Lead");
    expect(eventNameFor("tiktok", "client")).toBe("Purchase");
    expect(eventNameFor("meta", "new")).toBeNull();
    expect(eventIdFor("L1", "client", "meta")).toBe("L1:client:meta");
  });
  it("adds value only when present", () => {
    const base = { eventName: "Purchase", eventId: "x", eventTime: 1, clickId: "c", phoneHash: "h" };
    expect(buildMetaPayload(base).data[0]).not.toHaveProperty("custom_data");
    expect(buildMetaPayload({ ...base, value: 50, currency: "SAR" }).data[0].custom_data).toEqual({ value: 50, currency: "SAR" });
    const tt = buildTikTokPayload("PIX", { ...base, value: 10 });
    expect(tt.event_source_id).toBe("PIX");
    expect(tt.data[0].properties).toMatchObject({ value: 10, currency: "USD" });
    expect(buildMetaPayload(base).data[0]).toMatchObject({ action_source: "business_messaging", messaging_channel: "whatsapp" });
  });
});

describe("text attribution", () => {
  it("finds click id and campaign code", () => {
    expect(extractClidFromText("Hi I want this ttclid=ABC123xyz")).toBe("ABC123xyz");
    expect(extractClidFromText("hello")).toBeNull();
    expect(extractCampaignCode("مرحبا cid=summer24")).toBe("summer24");
    expect(extractCampaignCode("no code")).toBeNull();
  });
});

describe("parseAdContext", () => {
  it("reads externalAdReply", () => {
    const ctx = parseAdContext({
      extendedTextMessage: {
        text: "hi",
        contextInfo: { externalAdReply: { sourceId: "123", sourceUrl: "https://fb.me/x", ctwaClid: "CLID", title: "Ad" } },
      },
    });
    expect(ctx).toEqual({ ctwaClid: "CLID", adId: "123", sourceUrl: "https://fb.me/x", headline: "Ad" });
  });
  it("returns null for plain messages", () => {
    expect(parseAdContext({ conversation: "hi" })).toBeNull();
    expect(parseAdContext(null)).toBeNull();
  });
});

describe("isFollowUpEligible", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const base: FollowUpInput = {
    agentStatus: "ai_active",
    followUpEnabled: true,
    lastInboundAt: "2026-10-28T08:00:00Z",
    lastOutboundAt: "2026-10-28T09:00:00Z",
    lastFollowUpAt: null,
    followUpCount: 0,
    followUpMax: 2,
    delayHours: 24,
    allowedStart: 9,
    allowedEnd: 21,
    timezone: "UTC",
    now,
  };
  it("eligible when quiet past delay inside hours", () => {
    expect(isFollowUpEligible(base)).toBe(true);
  });
  it("blocks on each guard", () => {
    expect(isFollowUpEligible({ ...base, agentStatus: "handed_off" })).toBe(false);
    expect(isFollowUpEligible({ ...base, followUpEnabled: false })).toBe(false);
    expect(isFollowUpEligible({ ...base, followUpCount: 2 })).toBe(false);
    expect(isFollowUpEligible({ ...base, lastInboundAt: "2026-10-28T10:00:00Z" })).toBe(false);
    expect(isFollowUpEligible({ ...base, lastOutboundAt: "2026-10-29T06:00:00Z" })).toBe(false);
    expect(isFollowUpEligible({ ...base, lastFollowUpAt: "2026-10-29T00:00:00Z" })).toBe(false);
    expect(isFollowUpEligible({ ...base, now: new Date("2026-10-29T23:00:00Z") })).toBe(false);
  });
  it("respects timezone", () => {
    // 12:00 UTC is 15:00 in Riyadh (inside); 03:00 UTC is 06:00 Riyadh (outside)
    expect(isFollowUpEligible({ ...base, timezone: "Asia/Riyadh" })).toBe(true);
    expect(isFollowUpEligible({ ...base, timezone: "Asia/Riyadh", now: new Date("2026-10-30T03:00:00Z") })).toBe(false);
  });
});

describe("misc guards", () => {
  it("detects opt-out in Arabic and English", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("توقف")).toBe(true);
    expect(isOptOut("don't stop sending")).toBe(false);
  });
  it("validates analysis JSON", () => {
    expect(parseAnalysis('{"is_spam":false,"stage":"client","order_value":"120","currency":"sar","confidence":0.9,"evidence":"ok","language":"ar"}'))
      .toMatchObject({ stage: "client", order_value: 120, currency: "SAR", confidence: 0.9 });
    expect(parseAnalysis('{"is_spam":false,"stage":"vip"}')).toBeNull();
    expect(parseAnalysis("not json")).toBeNull();
  });
});
