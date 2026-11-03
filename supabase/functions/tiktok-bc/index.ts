import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeAgencyAdmin } from "../_shared/auth.ts";
import {
  checkFundAmount,
  extractList,
  parseAdvertiserBalance,
  parseBcList,
  resolveOwningBc,
  tagAccounts,
  type BcAccount,
  type BcAdvertiser,
  type BcSummary,
} from "../_shared/bcFunding.ts";
import { withCors } from "../_shared/cors.ts";

// Agency-level TikTok Business Center: connect it, list ad-account balances, top accounts up.
// Body: { action, agencyId, ... }. Only agency owners/admins; the token never leaves the server.
const API = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 50; // TikTok rejects anything larger

// Rows from /bc/asset/get/ and /bc/get/; field names vary, so every one is optional.
type BcAsset = {
  asset_id?: string | number;
  advertiser_id?: string | number;
  asset_name?: string;
  advertiser_name?: string;
  advertiser_role?: string;
  asset_role?: string;
  permission?: string;
  relation_type?: string;
} | null;
async function tt(
  path: string,
  token: string,
  init: { method?: string; body?: string; query?: Record<string, string> } = {},
) {
  const url = new URL(`${API}${path}`);
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
    const totalPages = Number(d.data?.page_info?.total_page);
    if (list.length === 0 || (Number.isFinite(totalPages) ? page >= totalPages : list.length < PAGE_SIZE)) break;
  }
  return { rows, sample };
}

type BcResult = BcSummary & {
  balance: number | null;
  currency: string | null;
  accounts: BcAccount[];
  error: string | null; // "no_finance_role" or TikTok's message; one failing BC never breaks the others
};

/** Every BC this login administers, each with its own ad accounts (= ownership) and available balance. */
async function loadAllBcs(token: string): Promise<{ bcs: BcResult[]; sample: unknown; error?: string; code?: number }> {
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

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const { action } = body;
      const auth = await authorizeAgencyAdmin(req, body.agencyId);
      if (auth instanceof Response) return auth;
      const { supabase, userId } = auth;
      const agencyId: string = body.agencyId;

      const { data: conn } = await supabase.from("bc_connections").select("*").eq("agency_id", agencyId).maybeSingle();

      if (action === "callback") {
        const appId = Deno.env.get("TIKTOK_APP_ID");
        const secret = Deno.env.get("TIKTOK_APP_SECRET");
        if (!appId || !secret) return json({ error: "TikTok integration not configured" }, 400);
        const res = await fetch(`${API}/oauth2/access_token/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_id: appId, secret, auth_code: body.code }),
        });
        const t = await res.json();
        if (t.code !== 0)
          return json({ error: "TikTok rejected the login. Try connecting again.", details: t.message }, 400);
        const token: string = t.data.access_token;

        // Business Centers this login can see (all of them are used for funding).
        const list = await tt("/bc/get/", token).catch(() => null);
        const bcs = parseBcList(list?.data);
        const row = {
          agency_id: agencyId,
          access_token: token,
          refresh_token: t.data.refresh_token ?? null,
          token_expires_at: t.data.access_token_expire_in
            ? new Date(Date.now() + Number(t.data.access_token_expire_in) * 1000).toISOString()
            : null,
          bc_id: conn?.bc_id ?? null, // legacy: funding now covers every BC the login administers
          bc_name: conn?.bc_name ?? null,
          connected_by: userId,
          connected_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("bc_connections").upsert(row, { onConflict: "agency_id" });
        if (error) return json({ error: "Could not save the connection" }, 500);
        return json({ success: true, bcId: row.bc_id, choices: [], businessCenters: bcs.length });
      }

      if (action === "disconnect") {
        await supabase.from("bc_connections").delete().eq("agency_id", agencyId);
        return json({ success: true });
      }

      if (!conn) return json({ error: "Connect your TikTok Business Center first", code: "not_connected" }, 400);

      if (action === "set-bc") {
        const bcId = String(body.bcId ?? "").trim();
        if (!/^\d{6,25}$/.test(bcId)) return json({ error: "Enter the numeric Business Center ID" }, 400);
        await supabase
          .from("bc_connections")
          .update({ bc_id: bcId, bc_name: typeof body.bcName === "string" ? body.bcName : null })
          .eq("agency_id", agencyId);
        return json({ success: true });
      }

      if (action === "diagnose") {
        // What this login can see at TikTok, per Business Center, to find a missing permission.
        const [bcs, advs] = await Promise.all([
          tt("/bc/get/", conn.access_token).catch((e) => ({ code: -1, message: String(e) })),
          tt("/oauth2/advertiser/get/", conn.access_token, {
            query: { app_id: Deno.env.get("TIKTOK_APP_ID") ?? "", secret: Deno.env.get("TIKTOK_APP_SECRET") ?? "" },
          }).catch((e) => ({ code: -1, message: String(e) })),
        ]);
        const failed = (e: unknown) => ({ code: -1, message: String(e) });
        const perBc = await Promise.all(
          parseBcList(bcs.data).map(async (bc) => {
            const q = (extra: Record<string, string>) => ({ bc_id: bc.bcId, page: "1", page_size: "50", ...extra });
            const [bal, assets] = await Promise.all([
              bc.canFinance ? tt("/advertiser/balance/get/", conn.access_token, { query: q({}) }).catch(failed) : null,
              tt("/bc/asset/get/", conn.access_token, { query: q({ asset_type: "ADVERTISER" }) }).catch(failed),
            ]);
            return {
              id: bc.bcId,
              name: bc.name,
              role: bc.userRole,
              financeRole: bc.financeRole,
              canFinance: bc.canFinance,
              balanceList: bal && {
                code: bal.code,
                message: bal.message,
                count: extractList(bal.data).length,
                total: bal.data?.page_info?.total_number ?? null,
              },
              assets: {
                code: assets.code,
                message: assets.message,
                total: assets.data?.page_info?.total_number ?? null,
                items: (assets.data?.list ?? []).slice(0, 10).map((i: BcAsset) => ({
                  id: String(i?.asset_id ?? i?.advertiser_id ?? ""),
                  name: i?.asset_name ?? i?.advertiser_name ?? null,
                  permission: i?.advertiser_role ?? i?.asset_role ?? i?.permission ?? i?.relation_type ?? null,
                })),
              },
            };
          }),
        );
        return json({
          businessCenters: { code: bcs.code, message: bcs.message, list: perBc },
          authorizedAdAccounts: { code: advs.code, message: advs.message, count: (advs.data?.list ?? []).length },
        });
      }

      if (action === "balances") {
        const all = await loadAllBcs(conn.access_token);
        if (all.error) return json({ error: all.error, code: "tiktok_error", tiktokCode: all.code }, 502);
        // Match ad accounts to WOB clients where the client connected the same advertiser.
        const { data: mine } = await supabase
          .from("tiktok_accounts")
          .select("advertiser_id, client_id")
          .eq("tenant_id", agencyId);
        const clientOf = new Map<string, string>(
          (mine ?? []).map((m: { advertiser_id: string; client_id: string }) => [m.advertiser_id, m.client_id]),
        );
        // Remember which BC (and so which agency) funds each account, for top-up requests from other agencies.
        const mapping = all.bcs.flatMap((bc) =>
          bc.accounts.map((a) => ({
            agency_id: agencyId,
            bc_id: bc.bcId,
            advertiser_id: a.advertiserId,
            advertiser_name: a.name,
            updated_at: new Date().toISOString(),
          })),
        );
        for (let i = 0; i < mapping.length; i += 500) {
          const { error: mapErr } = await supabase
            .from("bc_accounts")
            .upsert(mapping.slice(i, i + 500), { onConflict: "agency_id,advertiser_id" });
          if (mapErr) console.error("bc_accounts upsert failed", mapErr.message);
        }
        return json({
          maxTransfer: Number(conn.max_transfer),
          businessCenters: all.bcs.map((bc) => ({
            ...bc,
            accounts: bc.accounts.map((a) => ({ ...a, clientId: clientOf.get(a.advertiserId) ?? null })),
          })),
          sample: all.sample, // raw first row, so field names can be checked against TikTok's real answer
        });
      }

      if (action === "fund") {
        const advertiserId = String(body.advertiserId ?? "");
        let amount = body.amount;
        const requestId = typeof body.requestId === "string" ? body.requestId : null;
        if (requestId) {
          // Approving a top-up request: it must be this agency's, still pending, for this account; its amount wins.
          const { data: req } = await supabase
            .from("topup_requests")
            .select("funding_agency_id, advertiser_id, amount, status")
            .eq("id", requestId)
            .maybeSingle();
          if (!req || req.funding_agency_id !== agencyId || req.advertiser_id !== advertiserId)
            return json({ error: "Top-up request not found" }, 404);
          if (req.status !== "pending") return json({ error: "This request was already handled" }, 409);
          amount = Number(req.amount);
        }
        // The account's OWN Business Center, found server-side from what each BC administers; the browser sends no bc_id.
        const all = await loadAllBcs(conn.access_token);
        if (all.error) return json({ error: all.error }, 502);
        const target = resolveOwningBc(
          all.bcs.flatMap((b) => b.accounts),
          advertiserId,
        );
        if (!target) return json({ error: "That ad account is not under a Business Center you can fund from" }, 400);
        const bad = checkFundAmount(amount, Number(conn.max_transfer), target.minTransferable);
        if (bad) return json({ error: bad }, 400);

        // A second click or retry while one is unresolved could double-fund; make staff look first.
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: open } = await supabase
          .from("fund_transfers")
          .select("id")
          .eq("agency_id", agencyId)
          .eq("advertiser_id", advertiserId)
          .in("status", ["pending", "unknown"])
          .gte("created_at", since)
          .limit(1);
        if (open?.length)
          return json(
            {
              error: "A top-up for this account is still unresolved. Check TikTok before trying again.",
              code: "unresolved",
            },
            409,
          );

        const { data: acct } = await supabase
          .from("tiktok_accounts")
          .select("client_id")
          .eq("tenant_id", agencyId)
          .eq("advertiser_id", advertiserId)
          .limit(1)
          .maybeSingle();
        const { data: row, error: insErr } = await supabase
          .from("fund_transfers")
          .insert({
            agency_id: agencyId,
            client_id: acct?.client_id ?? null,
            advertiser_id: advertiserId,
            advertiser_name: target.name,
            bc_id: target.bcId,
            bc_name: target.bcName,
            amount,
            type: "RECHARGE",
            status: "pending",
            created_by: userId,
          })
          .select("id, request_id")
          .single();
        if (insErr || !row) return json({ error: "Could not record the top-up, nothing was sent" }, 500);

        let status: "sent" | "failed" | "unknown" = "unknown";
        let response: { code?: number; message?: string; request_id?: string; error?: string } | null = null;
        try {
          const d = await tt("/bc/transfer/", conn.access_token, {
            method: "POST",
            body: JSON.stringify({
              bc_id: target.bcId,
              advertiser_id: advertiserId,
              transfer_type: "RECHARGE",
              cash_amount: amount,
              request_id: row.request_id,
            }),
          });
          response = { code: d.code, message: d.message, request_id: d.request_id };
          status = d.code === 0 ? "sent" : "failed";
        } catch (e) {
          // Timeout or network cut: TikTok may or may not have applied it. Never guess; never auto-retry.
          response = { error: e instanceof Error ? e.message : String(e) };
        }
        await supabase.from("fund_transfers").update({ status, response }).eq("id", row.id);
        if (requestId && status === "sent")
          await supabase
            .from("topup_requests")
            .update({
              status: "approved",
              decided_by: userId,
              decided_at: new Date().toISOString(),
              fund_transfer_id: row.id,
            })
            .eq("id", requestId)
            .eq("status", "pending");
        else if (requestId && status === "failed")
          await supabase
            .from("topup_requests")
            .update({ error: response?.message ?? "TikTok rejected the transfer" })
            .eq("id", requestId); // stays pending so it can be retried
        return json(
          { success: status === "sent", status, message: response?.message ?? null },
          status === "failed" ? 502 : 200,
        );
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      console.error("tiktok-bc error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
