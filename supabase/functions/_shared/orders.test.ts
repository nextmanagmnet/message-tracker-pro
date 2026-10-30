import { describe, expect, it } from "vitest";
import { isOrderMessage, parseOrder } from "./orders";

describe("order confirmation", () => {
  it("matches the marker case-insensitively and ignores an empty marker", () => {
    expect(isOrderMessage("✅ order confirmed #12", "ORDER CONFIRMED")).toBe(true);
    expect(isOrderMessage("thanks", "ORDER CONFIRMED")).toBe(false);
    expect(isOrderMessage("anything", "")).toBe(false);
  });
  it("reads total and currency", () => {
    expect(parseOrder("ORDER CONFIRMED #1 | Total: 45.50 USD")).toEqual({ value: 45.5, currency: "USD" });
    expect(parseOrder("تم تأكيد الطلب\nالمجموع: ١٢٠ ر.س")).toEqual({ value: 120, currency: "SAR" });
    expect(parseOrder("Total: $1,250")).toEqual({ value: 1250, currency: "USD" });
  });
  it("returns nulls when there is no total", () => {
    expect(parseOrder("ORDER CONFIRMED #1")).toEqual({ value: null, currency: null });
  });
});
