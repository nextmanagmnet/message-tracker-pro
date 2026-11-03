import { describe, expect, it } from "vitest";
import { isOrderMessage, nextOrderStatus, orderEventFor, parseOrder, pickOrderValue } from "./orders";

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

describe("pickOrderValue", () => {
  const defaults = { value: "60", currency: "USD" };
  it("uses the default when the message had no total", () => {
    expect(pickOrderValue({ value: null, currency: null }, defaults)).toEqual({ value: 60, currency: "USD" });
  });
  it("keeps an amount from the message and only fills a missing currency", () => {
    expect(pickOrderValue({ value: 45, currency: "SAR" }, defaults)).toEqual({ value: 45, currency: "SAR" });
    expect(pickOrderValue({ value: 45, currency: null }, defaults)).toEqual({ value: 45, currency: "USD" });
  });
  it("sends no value when there is no default either", () => {
    expect(pickOrderValue({ value: null, currency: null }, { value: null, currency: null })).toEqual({
      value: null,
      currency: null,
    });
    expect(pickOrderValue({ value: null, currency: null }, { value: 0, currency: "USD" })).toEqual({
      value: null,
      currency: null,
    });
  });
});

describe("order status", () => {
  const markers = { order: "ORDER CONFIRMED", delivery: "ORDER DELIVERED", return: "ORDER RETURNED" };
  it("tells confirmation, delivery and return apart, case-insensitively", () => {
    expect(orderEventFor("✅ order confirmed #1", markers)).toBe("confirm");
    expect(orderEventFor("Order Delivered #1, thanks!", markers)).toBe("deliver");
    expect(orderEventFor("ORDER RETURNED #1", markers)).toBe("return");
    expect(orderEventFor("hello", markers)).toBeNull();
  });
  it("lets a return phrase win over a delivery phrase it contains", () => {
    expect(orderEventFor("NOT DELIVERED", { order: null, delivery: "DELIVERED", return: "NOT DELIVERED" })).toBe(
      "return",
    );
  });
  it("ignores a missing phrase (delivery is off in confirmation mode)", () => {
    expect(orderEventFor("ORDER DELIVERED", { ...markers, delivery: null })).toBeNull();
  });
  it("moves confirmed -> delivered -> returned and never back", () => {
    expect(nextOrderStatus(null, "confirm")).toBe("confirmed");
    expect(nextOrderStatus("confirmed", "confirm")).toBeNull();
    expect(nextOrderStatus("confirmed", "deliver")).toBe("delivered");
    expect(nextOrderStatus(null, "deliver")).toBe("delivered");
    expect(nextOrderStatus("delivered", "deliver")).toBeNull();
    expect(nextOrderStatus("delivered", "return")).toBe("returned");
    expect(nextOrderStatus("returned", "deliver")).toBeNull();
    expect(nextOrderStatus("returned", "return")).toBeNull();
  });
});
