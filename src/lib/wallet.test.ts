import { describe, expect, it } from "vitest";
import { entryKind, feeFor, validateSettings } from "./wallet";

describe("feeFor", () => {
  it("adds commission and flat fee", () => {
    expect(feeFor(100, 3, 0)).toBe(3);
    expect(feeFor(100, 2.5, 1)).toBe(3.5);
    expect(feeFor(33.33, 3, 0)).toBe(1);
  });
});

describe("entryKind", () => {
  it("maps unknown kinds to adjustment", () => {
    expect(entryKind("refund")).toBe("refund");
    expect(entryKind("weird")).toBe("adjustment");
  });
});

describe("validateSettings", () => {
  const ok = { commission: "3", flatFee: "0", minTopup: "10", instructions: "" };
  it("accepts valid", () => expect(validateSettings(ok)).toBeNull());
  it("rejects out-of-range values", () => {
    expect(validateSettings({ ...ok, commission: "51" })).toBe("commission");
    expect(validateSettings({ ...ok, flatFee: "-1" })).toBe("flatFee");
    expect(validateSettings({ ...ok, minTopup: "0" })).toBe("minTopup");
    expect(validateSettings({ ...ok, instructions: "x".repeat(1001) })).toBe("instructions");
    expect(validateSettings({ ...ok, commission: "" })).toBe("commission");
  });
});
