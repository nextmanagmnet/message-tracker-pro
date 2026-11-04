import { describe, expect, it } from "vitest";
import { feeFor, isReferenceCode, mapWalletError, validateLimits, validatePaymentAmount } from "./wallet";
import { creditArgs, WALLET_PROVIDERS } from "./walletProviders";

describe("feeFor (mirrors SQL round(amount * pct / 100 + flat, 2))", () => {
  it("matches the SQL example: 100 at 2% + 1.00 = 3", () => {
    expect(feeFor(100, { commissionPercent: 2, flatFee: 1 })).toBe(3);
  });
  it("rounds to two decimals and is 0 without settings", () => {
    expect(feeFor(33.33, { commissionPercent: 2.5, flatFee: 0 })).toBe(0.83);
    expect(feeFor(10.01, { commissionPercent: 5, flatFee: 0 })).toBe(0.5);
    expect(feeFor(100, null)).toBe(0);
  });
});

describe("validatePaymentAmount", () => {
  it("accepts good amounts", () => {
    expect(validatePaymentAmount(50)).toBeNull();
    expect(validatePaymentAmount(10000)).toBeNull();
    expect(validatePaymentAmount(0.5)).toBeNull();
  });
  it("rejects bad amounts", () => {
    for (const v of [0, -1, "5", Number.NaN, 1.234, 10000.01]) expect(validatePaymentAmount(v)).not.toBeNull();
  });
});

describe("isReferenceCode", () => {
  it("checks the W-XXXXXX format", () => {
    expect(isReferenceCode("W-A1B2C3")).toBe(true);
    for (const v of ["w-a1b2c3", "W-A1B2C", "W-A1B2C3D", "A1B2C3", 5, null]) expect(isReferenceCode(v)).toBe(false);
  });
});

describe("mapWalletError", () => {
  it("maps database errors to coded responses", () => {
    expect(mapWalletError({ message: "insufficient_funds" })?.code).toBe("insufficient_funds");
    expect(mapWalletError({ message: "currency_mismatch" })?.code).toBe("currency_mismatch");
    expect(mapWalletError({ message: "below_minimum" })?.code).toBe("below_minimum");
    expect(mapWalletError({ code: "23505", message: "duplicate key" })).toMatchObject({
      status: 409,
      code: "already_pending",
    });
    expect(mapWalletError({ message: "not_pending" })?.status).toBe(409);
  });
  it("leaves unknown errors alone", () => {
    expect(mapWalletError({ message: "boom" })).toBeNull();
    expect(mapWalletError(null)).toBeNull();
  });
});

describe("providers", () => {
  const pay = { provider: "manual", providerRef: "R-1", clientId: "c", amount: 20, currency: "USD" };
  it("only the manual provider is registered", () => {
    expect(Object.keys(WALLET_PROVIDERS)).toEqual(["manual"]);
  });
  it("builds a wallet_apply credit", () => {
    expect(creditArgs(pay, "USD").args).toMatchObject({
      p_kind: "topup",
      p_provider: "manual",
      p_provider_ref: "R-1",
      p_amount: 20,
    });
  });
  it("refuses unknown providers, empty refs, bad amounts and currency mismatches", () => {
    expect(creditArgs({ ...pay, provider: "nope" }, "USD").error).toBeTruthy();
    expect(creditArgs({ ...pay, providerRef: " " }, "USD").error).toBeTruthy();
    expect(creditArgs({ ...pay, amount: 0 }, "USD").error).toBeTruthy();
    expect(creditArgs(pay, "SAR").error).toBeTruthy();
  });
});

describe("validateLimits", () => {
  const ok = { maxDailyTransfer: 5000, paymentApprovalOver: 500, paymentDailyCap: 10000 };
  it("accepts sane limits, including an approval threshold of 0", () => {
    expect(validateLimits(ok)).toEqual({ ok: true, value: ok });
    expect(validateLimits({ ...ok, paymentApprovalOver: 0 }).ok).toBe(true);
  });
  it("refuses zero, negative, huge or non-numeric daily limits", () => {
    for (const bad of [0, -5, 2_000_000, NaN, Infinity, "5000", null, undefined])
      expect(validateLimits({ ...ok, maxDailyTransfer: bad }).ok).toBe(false);
    expect(validateLimits({ ...ok, paymentDailyCap: 0 }).ok).toBe(false);
  });
  it("refuses a negative threshold and more than two decimals", () => {
    expect(validateLimits({ ...ok, paymentApprovalOver: -1 }).ok).toBe(false);
    expect(validateLimits({ ...ok, maxDailyTransfer: 10.123 }).ok).toBe(false);
  });
});
