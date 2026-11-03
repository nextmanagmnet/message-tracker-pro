// Parsing and checks for TikTok Business Center funding. TikTok's response field names for balances
// aren't fully documented, so read the likely names and keep the raw row for the UI to show.

const num = (v: unknown) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const firstNum = (row: BalanceRow, keys: string[]) => keys.map((k) => num(row?.[k])).find((n) => n !== null) ?? null;

// One row of TikTok's balance list; any field may be missing.
interface BalanceRow {
  advertiser_id?: string | number;
  advertiserId?: string | number;
  advertiser_name?: string | null;
  name?: string | null;
  currency?: string | null;
  min_transferable_amount?: unknown;
  [key: string]: unknown;
}

export interface BcAdvertiser {
  advertiserId: string;
  name: string | null;
  balance: number | null;
  currency: string | null;
  minTransferable: number | null;
}

/** TikTok names the account array differently per endpoint (balance/get uses advertiser_account_list). */
export function extractList(data: unknown): unknown[] {
  const d = data as { advertiser_account_list?: unknown; list?: unknown } | null | undefined;
  if (Array.isArray(d?.advertiser_account_list)) return d.advertiser_account_list;
  if (Array.isArray(d?.list)) return d.list;
  return Object.values(data ?? {}).find(Array.isArray) ?? [];
}

export function parseAdvertiserBalance(input: unknown): BcAdvertiser | null {
  const row = input as BalanceRow | null | undefined;
  const id = row?.advertiser_id ?? row?.advertiserId;
  if (!row || !id) return null;
  return {
    advertiserId: String(id),
    name: row.advertiser_name ?? row.name ?? null,
    balance: firstNum(row, ["account_balance", "balance", "advertiser_balance", "cash_balance", "available_balance"]),
    currency: row.currency ?? null,
    minTransferable: num(row.min_transferable_amount),
  };
}

/** Returns an error message, or null when the top-up may go ahead. */
export function checkFundAmount(amount: unknown, max: number, min: number | null): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than zero";
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return "Use at most two decimal places";
  if (amount > max) return `The limit per top-up is ${max}`;
  if (min !== null && amount < min) return `TikTok's minimum top-up for this account is ${min}`;
  return null;
}
