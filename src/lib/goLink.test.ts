import { describe, expect, it } from "vitest";
import { goLink } from "./goLink";

describe("goLink", () => {
  it("keeps digits only and leaves the campaign macro unencoded", () => {
    expect(goLink("https://wob.app/", "+961 70-123", "مرحبا", "PX1")).toBe(
      "https://wob.app/go?to=96170123&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7&px=PX1&cid=__CAMPAIGN_ID__",
    );
  });

  it("omits the pixel when there is none, and is empty without a number", () => {
    expect(goLink("https://wob.app", "123", "Hi", null)).toBe("https://wob.app/go?to=123&text=Hi&cid=__CAMPAIGN_ID__");
    expect(goLink("https://wob.app", "", "Hi")).toBe("");
  });
});
