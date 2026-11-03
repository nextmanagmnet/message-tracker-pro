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

// ---- Multi-Business-Center helpers (pure) ----

export interface BcSummary {
  bcId: string;
  name: string | null;
  userRole: string | null;
  financeRole: string | null;
  /** True only when the login is Finance Manager in this BC; only then can balances be read or money moved. */
  canFinance: boolean;
}

/** Rows of /bc/get/: `{ bc_info: { bc_id, name }, user_role, ext_user_role: { finance_role } }`. */
export function parseBcList(data: unknown): BcSummary[] {
  const list = (data as { list?: unknown } | null | undefined)?.list;
  if (!Array.isArray(list)) return [];
  const out: BcSummary[] = [];
  for (const item of list) {
    const i = item as {
      bc_info?: { bc_id?: string | number; name?: string | null } | null;
      bc_id?: string | number;
      name?: string | null;
      user_role?: string | null;
      ext_user_role?: { finance_role?: string | null } | null;
    } | null;
    const id = i?.bc_info?.bc_id ?? i?.bc_id;
    if (!id) continue;
    const financeRole = i?.ext_user_role?.finance_role ?? null;
    out.push({
      bcId: String(id),
      name: i?.bc_info?.name ?? i?.name ?? null,
      userRole: i?.user_role ?? null,
      financeRole,
      canFinance: financeRole === "MANAGER",
    });
  }
  return out;
}

export interface BcAccount extends BcAdvertiser {
  bcId: string;
  bcName: string | null;
}

export function tagAccounts(bc: Pick<BcSummary, "bcId" | "name">, rows: BcAdvertiser[]): BcAccount[] {
  return rows.map((r) => ({ ...r, bcId: bc.bcId, bcName: bc.name }));
}

/** Groups accounts by their BC, keeping first-seen BC order. */
export function groupAccountsByBc<T extends { bcId: string }>(accounts: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const a of accounts) m.set(a.bcId, [...(m.get(a.bcId) ?? []), a]);
  return m;
}

/**
 * The BC that owns an ad account, from BCs the login can finance. Null when none lists it, or when
 * more than one does (ambiguous: never guess which BC to move money from).
 */
export function resolveOwningBc<T extends { bcId: string; advertiserId: string }>(
  accounts: T[],
  advertiserId: string,
): T | null {
  const hits = accounts.filter((a) => a.advertiserId === advertiserId);
  return hits.length === 1 ? hits[0] : null;
}
