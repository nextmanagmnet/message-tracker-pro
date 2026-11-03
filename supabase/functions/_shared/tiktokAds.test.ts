import { describe, expect, it } from "vitest";
import {
  adBody,
  adGroupBody,
  ageGroups,
  campaignBody,
  goLink,
  parseSuggestion,
  reviewSummary,
  scheduleTime,
  validateLaunch,
} from "./tiktokAds";

const valid = {
  launchId: "0b6a1c2e-3f4d-4a5b-8c6d-7e8f9a0b1c2d",
  name: "Summer offer",
  locationIds: ["272103"],
  ageMin: 18,
  ageMax: 44,
  gender: "GENDER_UNLIMITED",
  dailyBudget: 20,
  startAt: null,
  whatsappNumberId: "1b6a1c2e-3f4d-4a5b-8c6d-7e8f9a0b1c2d",
  message: "Hi, I saw your ad",
  cta: "CONTACT_US",
  mediaIds: ["video:v1"],
  texts: ["Order on WhatsApp"],
  identity: { id: "ident", type: "BC_AUTH_TT", bcId: "42" },
};

describe("validateLaunch", () => {
  it("accepts a complete request", () => {
    const r = validateLaunch(valid);
    expect(r.ok).toBe(true);
  });

  it.each([
    [{ dailyBudget: 19 }, "at least 20"],
    [{ dailyBudget: 501 }, "capped at 500"],
    [{ ageMin: 13 }, "18 or older"],
    [{ cta: "DOWNLOAD_NOW" }, "call to action"],
    [{ texts: ["x".repeat(101)] }, "100 characters"],
    [{ launchId: "nope" }, "UUID"],
    [{ locationIds: ["Lebanon"] }, "location"],
    [{ mediaIds: [] }, "video or image"],
    [{ identity: {} }, "TikTok account"],
    [{ mediaIds: ["a", "b", "c", "d", "e"], texts: ["1", "2", "3", "4", "5"] }, "At most 20"],
  ])("rejects %j", (patch, msg) => {
    const r = validateLaunch({ ...valid, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it("honours a raised server-side cap", () => {
    expect(validateLaunch({ ...valid, dailyBudget: 900 }, 1000).ok).toBe(true);
  });
});

describe("builders", () => {
  const input = (() => {
    const r = validateLaunch(valid);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  })();
  const now = new Date("2026-11-03T10:00:00Z");

  it("maps an age range to TikTok buckets, never minors", () => {
    expect(ageGroups(18, 44)).toEqual(["AGE_18_24", "AGE_25_34", "AGE_35_44"]);
    expect(ageGroups(30, 100)).toEqual(["AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"]);
  });

  it("schedules a past or missing start two minutes from now", () => {
    expect(scheduleTime(null, now)).toBe("2026-11-03 10:02:00");
    expect(scheduleTime("2026-11-05T08:30:00Z", now)).toBe("2026-11-05 08:30:00");
  });

  it("creates everything paused unless enabled", () => {
    expect(campaignBody("adv", "n", false)).toMatchObject({
      objective_type: "LEAD_GENERATION",
      operation_status: "DISABLE",
    });
    const g = adGroupBody("adv", "c1", input, "7702784565777399829", true, now);
    expect(g).toMatchObject({
      optimization_event: "FORM",
      pixel_id: "7702784565777399829",
      budget: 20,
      location_ids: ["272103"],
      operation_status: "ENABLE",
    });
  });

  it("builds one ad per creative and text, pixel id kept as a string", () => {
    const body = adBody("adv", "g1", {
      name: "N",
      creatives: [{ videoId: "v1", imageIds: ["i1"] }, { tiktokItemId: "p1" }],
      texts: ["a", "b"],
      identity: { id: "ident", type: "BC_AUTH_TT", bcId: "42" },
      landingUrl: "https://x/go",
      pixelId: "7702784565777399829",
      cta: "CONTACT_US",
      enabled: false,
    });
    expect(body.creatives).toHaveLength(4);
    expect(body.creatives[0]).toMatchObject({
      ad_name: "N - 1.1",
      video_id: "v1",
      image_ids: ["i1"],
      identity_authorized_bc_id: "42",
      tracking_pixel_id: "7702784565777399829",
      operation_status: "DISABLE",
    });
    expect(body.creatives[2]).toMatchObject({ tiktok_item_id: "p1" });
    expect(body.creatives[2]).not.toHaveProperty("video_id");
  });

  it("builds the WOB /go link", () => {
    expect(goLink("https://wob.app/", "+961 70 123", "Hi there", "PX1")).toBe(
      "https://wob.app/go?to=96170123&text=Hi+there&px=PX1&cid=__CAMPAIGN_ID__",
    );
  });
});

describe("parseSuggestion", () => {
  it("keeps valid texts and clamps targeting", () => {
    const s = parseSuggestion(
      JSON.stringify({
        texts: ["one", "x".repeat(120), "two", "three", "four"],
        message: "Hello",
        country_code: "lb",
        age_min: 10,
        age_max: 40,
        gender: "GENDER_FEMALE",
      }),
    );
    expect(s).toEqual({
      texts: ["one", "two", "three"],
      message: "Hello",
      countryCode: "LB",
      ageMin: 18,
      ageMax: 40,
      gender: "GENDER_FEMALE",
    });
  });

  it("returns null for junk", () => {
    expect(parseSuggestion(null)).toBeNull();
    expect(parseSuggestion("{}")).toBeNull();
  });
});

describe("reviewSummary", () => {
  it("joins ads with their review reasons", () => {
    const out = reviewSummary([{ ad_id: "1", ad_name: "A", secondary_status: "AD_STATUS_NOT_PASS" }], {
      "1": { is_approved: false, reject_info: [{ reason: "Misleading", suggestion: "Remove claims" }] },
    });
    expect(out).toEqual([
      {
        adId: "1",
        name: "A",
        status: "AD_STATUS_NOT_PASS",
        approved: false,
        reasons: ["Misleading", "Remove claims"],
      },
    ]);
  });
});
