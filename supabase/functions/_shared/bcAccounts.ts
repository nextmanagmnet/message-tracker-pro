import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractList,
  parseAdvertiserBalance,
  parseBcList,
  tagAccounts,
  type BcAccount,
  type BcAdvertiser,
  type BcSummary,
} from "./bcFunding.ts";

// Loads every Business Center a TikTok login administers (shared by tiktok-bc and agency-links).
export const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 50; // TikTok rejects anything larger

export async function tt(
  path: string,
  token: string,
  init: { method?: string; body?: string; query?: Record<string, string> } = {},
) {
  const url = new URL(`${TIKTOK_API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "Access-Token": token, "Content-Type": "application/json" },
    body: init.body,
    signal: AbortSignal.timeout(20000),
  });
  return await res.json().catch(() => ({ code: -1, message: `HTTP ${res.status}` }));
}

async function listBalances(
  bcId: string,
  token: string,
  stopAt?: string, // stop paging once this ad account has been read
): Promise<{ rows: BcAdvertiser[]; sample: unknown; error?: string }> {
  const rows: BcAdvertiser[] = [];
  let sample: unknown = null;
  for (let page = 1; page <= 100; page++) {
    const query: Record<string, string> = {
      bc_id: bcId,
      page: String(page),
      page_size: String(PAGE_SIZE),
      fields: JSON.stringify(["min_transferable_amount"]),
    };
    let d = await tt("/advertiser/balance/get/", token, { query });
    if (d.code !== 0 && page === 1) {
      delete query.fields; // retry without the optional field
      d = await tt("/advertiser/balance/get/", token, { query });
    }
    if (d.code !== 0) return { rows, sample, error: d.message ?? `TikTok error ${d.code}` };
    const list = extractList(d.data);
    sample ??= list[0] ?? null;
    for (const r of list) {
      const p = parseAdvertiserBalance(r);
      if (p) rows.push(p);
    }
    if (stopAt && rows.some((r) => r.advertiserId === stopAt)) break;
    const totalPages = Number(d.data?.page_info?.total_page);
    if (list.length === 0 || (Number.isFinite(totalPages) ? page >= totalPages : list.length < PAGE_SIZE)) break;
  }
  return { rows, sample };
}

/**
 * One ad account's credit inside a Business Center: what TikTok shows as available to it. An account paid for by a
 * Business Center holds its money there, so the account's own info page does not carry it.
 * ponytail: pages through the BC's accounts until it finds this one (~10 calls for 500 accounts); cache if it gets slow.
 */
export async function advertiserBalance(
  bcId: string,
  token: string,
  advertiserId: string,
): Promise<BcAdvertiser | null> {
  const { rows } = await listBalances(bcId, token, advertiserId);
  return rows.find((r) => r.advertiserId === advertiserId) ?? null;
}

export type BcResult = BcSummary & {
  balance: number | null;
  currency: string | null;
  accounts: BcAccount[];
  error: string | null; // "no_finance_role" or TikTok's message; one failing BC never breaks the others
};

/** Every BC this login administers, each with its own ad accounts (= ownership) and available balance. */
export async function loadAllBcs(
  token: string,
): Promise<{ bcs: BcResult[]; sample: unknown; error?: string; code?: number }> {
  const l = await tt("/bc/get/", token).catch((e) => ({ code: -1, message: String(e) }));
  if (l.code !== 0) return { bcs: [], sample: null, error: l.message ?? `TikTok error ${l.code}`, code: l.code };
  let sample: unknown = null;
  const bcs = await Promise.all(
    parseBcList(l.data).map(async (bc): Promise<BcResult> => {
      const base = { ...bc, balance: null, currency: null, accounts: [], error: null };
      if (!bc.canFinance) return { ...base, error: "no_finance_role" };
      try {
        const [acc, bal] = await Promise.all([
          listBalances(bc.bcId, token),
          tt("/bc/balance/get/", token, { query: { bc_id: bc.bcId } }).catch(() => null),
        ]);
        sample ??= acc.sample;
        const b = bal?.code === 0 ? bal.data : null;
        const available = Number(b?.valid_account_balance ?? b?.account_balance);
        return {
          ...base,
          balance: Number.isFinite(available) ? available : null,
          currency: b?.currency ?? null,
          accounts: tagAccounts(bc, acc.rows),
          error: acc.error ?? null,
        };
      } catch (e) {
        return { ...base, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return { bcs, sample };
}

/** Remembers which BC (and so which agency) holds each ad account. Returns how many accounts were written. */
export async function saveBcAccounts(supabase: SupabaseClient, agencyId: string, bcs: BcResult[]): Promise<number> {
  const mapping = bcs.flatMap((bc) =>
    bc.accounts.map((a) => ({
      agency_id: agencyId,
      bc_id: bc.bcId,
      bc_name: bc.name,
      advertiser_id: a.advertiserId,
      advertiser_name: a.name,
      updated_at: new Date().toISOString(),
    })),
  );
  for (let i = 0; i < mapping.length; i += 500) {
    const { error } = await supabase
      .from("bc_accounts")
      .upsert(mapping.slice(i, i + 500), { onConflict: "agency_id,advertiser_id" });
    if (error) console.error("bc_accounts upsert failed", error.message);
  }
  return mapping.length;
}
