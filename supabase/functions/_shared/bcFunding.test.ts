import { describe, expect, it } from "vitest";
import { checkFundAmount, extractList, parseAdvertiserBalance } from "./bcFunding";

describe("checkFundAmount", () => {
  it("accepts a normal amount and rejects bad ones", () => {
    expect(checkFundAmount(50, 1000, null)).toBeNull();
    expect(checkFundAmount(12.34, 1000, null)).toBeNull();
    expect(checkFundAmount(0, 1000, null)).not.toBeNull();
    expect(checkFundAmount(-5, 1000, null)).not.toBeNull();
    expect(checkFundAmount("50", 1000, null)).not.toBeNull();
    expect(checkFundAmount(NaN, 1000, null)).not.toBeNull();
    expect(checkFundAmount(10.123, 1000, null)).not.toBeNull();
  });
  it("enforces the cap and TikTok's minimum", () => {
    expect(checkFundAmount(1001, 1000, null)).toMatch(/limit/);
    expect(checkFundAmount(5, 1000, 20)).toMatch(/minimum/);
    expect(checkFundAmount(20, 1000, 20)).toBeNull();
  });
});

describe("parseAdvertiserBalance", () => {
  it("reads the common field names and ignores rows without an id", () => {
    expect(parseAdvertiserBalance({ advertiser_id: 1, advertiser_name: "A", balance: "12.5", currency: "USD", min_transferable_amount: "1" }))
      .toEqual({ advertiserId: "1", name: "A", balance: 12.5, currency: "USD", minTransferable: 1 });
    expect(parseAdvertiserBalance({ name: "no id" })).toBeNull();
  });
});

describe("TikTok's real balance response shape", () => {
  it("finds advertiser_account_list and reads account_balance", () => {
    const data = { advertiser_account_list: [{ advertiser_id: "7701420549729419285", advertiser_name: "Hamdan 003", account_balance: 0, cash_balance: 0, currency: "USD" }], page_info: { total_page: 10 } };
    expect(extractList(data)).toHaveLength(1);
    expect(parseAdvertiserBalance(extractList(data)[0])).toMatchObject({ advertiserId: "7701420549729419285", name: "Hamdan 003", balance: 0, currency: "USD" });
  });
  it("still finds a plain list, and returns [] for nothing", () => {
    expect(extractList({ list: [1, 2] })).toEqual([1, 2]);
    expect(extractList(undefined)).toEqual([]);
  });
});
