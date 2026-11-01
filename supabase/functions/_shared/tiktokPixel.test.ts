import { describe, expect, it } from "vitest";
import { missingEvents, pickPixel, pixelName, WOB_PIXEL_EVENTS } from "./tiktokPixel";

describe("tiktok pixel setup helpers", () => {
  it("only asks for events the pixel does not have yet", () => {
    expect(missingEvents([])).toHaveLength(WOB_PIXEL_EVENTS.length);
    expect(missingEvents([{ event_type: "CONSULT" }, { event_type: "FORM" }]).map((e) => e.event_name)).toEqual(["Purchase"]);
    expect(missingEvents([{ event_type: "CONSULT" }, { event_type: "FORM" }, { event_type: "SHOPPING" }])).toEqual([]);
  });
  it("keeps the saved pixel, else takes the first, else none", () => {
    const list = [{ pixel_code: "AAA" }, { pixel_code: "BBB" }];
    expect(pickPixel(list, "BBB")).toBe(list[1]);
    expect(pickPixel(list, "ZZZ")).toBe(list[0]);
    expect(pickPixel(list, null)).toBe(list[0]);
    expect(pickPixel([], "AAA")).toBeNull();
  });
  it("makes a TikTok-safe pixel name", () => {
    expect(pixelName("A Square 🔥")).toBe("WOB A Square");
    expect(pixelName("x".repeat(80))).toHaveLength(40);
    expect(pixelName("متجر")).toBe("WOB متجر");
  });
});
