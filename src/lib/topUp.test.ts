import { describe, expect, it } from "vitest";
import { balanceLevel, topUpRoute } from "./topUp";

describe("topUpRoute", () => {
  it("uses the Business Center only for agency staff who manage one", () => {
    expect(topUpRoute({ isAgencyStaff: true, canManage: true, hasBusinessCenter: true })).toBe("funding");
    expect(topUpRoute({ isAgencyStaff: true, canManage: true, hasBusinessCenter: false })).toBe("ads-manager");
    expect(topUpRoute({ isAgencyStaff: true, canManage: false, hasBusinessCenter: true })).toBe("ads-manager");
  });
  it("sends individuals and client users to TikTok", () => {
    expect(topUpRoute({ isAgencyStaff: false, canManage: true, hasBusinessCenter: true })).toBe("ads-manager");
  });
});

describe("balanceLevel", () => {
  it("rates a balance", () => {
    expect(balanceLevel(0)).toBe("empty");
    expect(balanceLevel(-3)).toBe("empty");
    expect(balanceLevel(7.38)).toBe("low");
    expect(balanceLevel(20)).toBe("ok");
    expect(balanceLevel(250)).toBe("ok");
    expect(balanceLevel(null)).toBe("unknown");
    expect(balanceLevel(Number.NaN)).toBe("unknown");
  });
});
