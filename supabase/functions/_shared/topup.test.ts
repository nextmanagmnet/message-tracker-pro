import { describe, expect, it } from "vitest";
import { pickFundingAgency, requestNotice, validateTopUpAmount } from "./topup";

describe("validateTopUpAmount", () => {
  it("accepts a normal amount within the cap", () => {
    expect(validateTopUpAmount(100, 1000)).toBeNull();
    expect(validateTopUpAmount(12.5, 1000)).toBeNull();
    expect(validateTopUpAmount(1000, 1000)).toBeNull();
  });
  it("rejects bad amounts", () => {
    expect(validateTopUpAmount(0, 1000)).not.toBeNull();
    expect(validateTopUpAmount(-5, 1000)).not.toBeNull();
    expect(validateTopUpAmount("100", 1000)).not.toBeNull();
    expect(validateTopUpAmount(Number.NaN, 1000)).not.toBeNull();
    expect(validateTopUpAmount(10.123, 1000)).not.toBeNull();
    expect(validateTopUpAmount(1001, 1000)).toMatch(/1000/);
  });
});

describe("pickFundingAgency", () => {
  it("takes the one agency that lists the account", () => {
    expect(pickFundingAgency(["a"], "me")).toBe("a");
    expect(pickFundingAgency(["a", "a"], "me")).toBe("a");
  });
  it("prefers the requester's own agency when several list it", () => {
    expect(pickFundingAgency(["a", "me"], "me")).toBe("me");
  });
  it("never guesses between other agencies, and returns none when nobody lists it", () => {
    expect(pickFundingAgency(["a", "b"], "me")).toBeNull();
    expect(pickFundingAgency([], "me")).toBeNull();
  });
});

describe("requestNotice", () => {
  it("names the client, account and amount", () => {
    const n = requestNotice("Acme", "Acme Shop", 250, "USD");
    expect(n.title).toContain("250 USD");
    expect(n.body).toContain("Acme");
    expect(n.body).toContain("Acme Shop");
  });
});
