// Where a "Top up" click should go, and how worried to look about a balance.

// Agency staff who manage a connected Business Center can move funds from it in WOB (/funding).
// Everyone else tops up in TikTok itself: WOB can't take card payments on TikTok's behalf.
export type TopUpRoute = "funding" | "ads-manager";

export function topUpRoute(o: { isAgencyStaff: boolean; canManage: boolean; hasBusinessCenter: boolean }): TopUpRoute {
  return o.isAgencyStaff && o.canManage && o.hasBusinessCenter ? "funding" : "ads-manager";
}

export type BalanceLevel = "unknown" | "empty" | "low" | "ok";

// ponytail: fixed $20 floor (TikTok's minimum daily budget); compare against the real daily budget if it matters.
export function balanceLevel(amount: number | null | undefined, floor = 20): BalanceLevel {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "unknown";
  if (amount <= 0) return "empty";
  return amount < floor ? "low" : "ok";
}

// TikTok publishes no deep link to its payment page, so send people to Ads Manager and the official how-to.
export const ADS_MANAGER_URL = "https://ads.tiktok.com/";
export const TOP_UP_HELP_URL = "https://ads.tiktok.com/help/article/add-to-your-account-balance-in-tiktok-ads-manager";
