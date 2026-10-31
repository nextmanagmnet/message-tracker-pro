import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeAgencyAdmin } from "../_shared/auth.ts";
import { checkFundAmount, parseAdvertiserBalance, type BcAdvertiser } from "../_shared/bcFunding.ts";

// Agency-level TikTok Business Center: connect it, list ad-account balances, top accounts up.
// Body: { action, agencyId, ... }. Only agency owners/admins; the token never leaves the server.
const API = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 50; // TikTok rejects anything larger

async function tt(path: string, token: string, init: { method?: string; body?: string; query?: Record<string, string> } = {}) {
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

async function listBalances(bcId: string, token: string): Promise<{ rows: BcAdvertiser[]; sample: unknown; error?: string }> {
  const rows: BcAdvertiser[] = [];
  let sample: unknown = null;
  for (let page = 1; page <= 100; page++) {
    const query: Record<string, string> = { bc_id: bcId, page: String(page), page_size: String(PAGE_SIZE), fields: JSON.stringify(["min_transferable_amount"]) };
    let d = await tt("/advertiser/balance/get/", token, { query });
    if (d.code !== 0 && page === 1) {
      delete query.fields; // retry without the optional field
      d = await tt("/advertiser/balance/get/", token, { query });
    }
    if (d.code !== 0) return { rows, sample, error: d.message ?? `TikTok error ${d.code}` };
    const list: any[] = d.data?.list ?? [];
    sample ??= list[0] ?? null;
    for (const r of list) {
      const p = parseAdvertiserBalance(r);
      if (p) rows.push(p);
    }
    if (list.length < PAGE_SIZE) break;
  }
  return { rows, sample };
}

Deno.serve(async (req) => {
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
      if (t.code !== 0) return json({ error: "TikTok rejected the login. Try connecting again.", details: t.message }, 400);
      const token: string = t.data.access_token;

      // Business Centers this login can see. If TikTok doesn't answer, the admin types the ID instead.
      const bcs: { id: string; name: string | null }[] = [];
      const list = await tt("/bc/get/", token).catch(() => null);
      for (const item of list?.data?.list ?? []) {
        const id = item?.bc_info?.bc_id ?? item?.bc_id;
        if (id) bcs.push({ id: String(id), name: item?.bc_info?.name ?? item?.name ?? null });
      }
      const row = {
        agency_id: agencyId,
        access_token: token,
        refresh_token: t.data.refresh_token ?? null,
        token_expires_at: t.data.access_token_expire_in ? new Date(Date.now() + Number(t.data.access_token_expire_in) * 1000).toISOString() : null,
        bc_id: bcs.length === 1 ? bcs[0].id : conn?.bc_id ?? null,
        bc_name: bcs.length === 1 ? bcs[0].name : conn?.bc_name ?? null,
        connected_by: userId,
        connected_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("bc_connections").upsert(row, { onConflict: "agency_id" });
      if (error) return json({ error: "Could not save the connection" }, 500);
      return json({ success: true, bcId: row.bc_id, choices: bcs.length > 1 ? bcs : [] });
    }

    if (action === "disconnect") {
      await supabase.from("bc_connections").delete().eq("agency_id", agencyId);
      return json({ success: true });
    }

    if (!conn) return json({ error: "Connect your TikTok Business Center first", code: "not_connected" }, 400);

    if (action === "set-bc") {
      const bcId = String(body.bcId ?? "").trim();
      if (!/^\d{6,25}$/.test(bcId)) return json({ error: "Enter the numeric Business Center ID" }, 400);
      await supabase.from("bc_connections").update({ bc_id: bcId, bc_name: typeof body.bcName === "string" ? body.bcName : null }).eq("agency_id", agencyId);
      return json({ success: true });
    }

    if (action === "diagnose") {
      // What this login can see at TikTok, to find a wrong Business Center ID or a missing permission.
      const bcForCalls = conn.bc_id;
      const [bcs, advs, bal, assets] = await Promise.all([
        tt("/bc/get/", conn.access_token).catch((e) => ({ code: -1, message: String(e) })),
        tt("/oauth2/advertiser/get/", conn.access_token, {
          query: { app_id: Deno.env.get("TIKTOK_APP_ID") ?? "", secret: Deno.env.get("TIKTOK_APP_SECRET") ?? "" },
        }).catch((e) => ({ code: -1, message: String(e) })),
        // What the funding list is built from: ad accounts this Business Center *administers*.
        bcForCalls
          ? tt("/advertiser/balance/get/", conn.access_token, { query: { bc_id: bcForCalls, page: "1", page_size: "50" } }).catch((e) => ({ code: -1, message: String(e) }))
          : Promise.resolve(null),
        // Everything shared with or owned by the Business Center, with the permission level.
        bcForCalls
          ? tt("/bc/asset/get/", conn.access_token, { query: { bc_id: bcForCalls, asset_type: "ADVERTISER", page: "1", page_size: "50" } }).catch((e) => ({ code: -1, message: String(e) }))
          : Promise.resolve(null),
      ]);
      return json({
        balanceList: bal && { code: bal.code, message: bal.message, count: (bal.data?.list ?? []).length, total: bal.data?.page_info?.total_number ?? null },
        assets: assets && {
          code: assets.code, message: assets.message, total: assets.data?.page_info?.total_number ?? null,
          items: (assets.data?.list ?? []).slice(0, 10).map((i: any) => ({
            id: String(i?.asset_id ?? i?.advertiser_id ?? ""), name: i?.asset_name ?? i?.advertiser_name ?? null,
            permission: i?.advertiser_role ?? i?.asset_role ?? i?.permission ?? i?.relation_type ?? null,
          })),
        },
        savedBcId: conn.bc_id,
        businessCenters: {
          code: bcs.code, message: bcs.message,
          list: (bcs.data?.list ?? []).map((i: any) => ({ id: String(i?.bc_info?.bc_id ?? i?.bc_id ?? ""), name: i?.bc_info?.name ?? i?.name ?? null, role: i?.user_role ?? null })),
        },
        authorizedAdAccounts: { code: advs.code, message: advs.message, count: (advs.data?.list ?? []).length },
      });
    }

    if (!conn.bc_id) return json({ error: "Choose your Business Center ID first", code: "no_bc" }, 400);

    if (action === "balances") {
      const [accounts, bc] = await Promise.all([
        listBalances(conn.bc_id, conn.access_token),
        tt("/bc/balance/get/", conn.access_token, { query: { bc_id: conn.bc_id } }).catch(() => null),
      ]);
      if (accounts.error && accounts.rows.length === 0) return json({ error: accounts.error }, 502);
      // Match ad accounts to WOB clients where the client connected the same advertiser.
      const { data: mine } = await supabase.from("tiktok_accounts").select("advertiser_id, client_id").eq("tenant_id", agencyId);
      const clientOf = new Map<string, string>((mine ?? []).map((m: any) => [m.advertiser_id, m.client_id]));
      return json({
        bcId: conn.bc_id,
        maxTransfer: Number(conn.max_transfer),
        bcBalance: bc?.code === 0 ? bc.data : null,
        accounts: accounts.rows.map((r) => ({ ...r, clientId: clientOf.get(r.advertiserId) ?? null })),
        sample: accounts.sample, // raw first row, so field names can be checked against TikTok's real answer
      });
    }

    if (action === "fund") {
      const advertiserId = String(body.advertiserId ?? "");
      const amount = body.amount;
      const { rows } = await listBalances(conn.bc_id, conn.access_token);
      const target = rows.find((r) => r.advertiserId === advertiserId);
      if (!target) return json({ error: "That ad account is not under your Business Center" }, 400);
      const bad = checkFundAmount(amount, Number(conn.max_transfer), target.minTransferable);
      if (bad) return json({ error: bad }, 400);

      // A second click or retry while one is unresolved could double-fund; make staff look first.
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: open } = await supabase.from("fund_transfers").select("id")
        .eq("agency_id", agencyId).eq("advertiser_id", advertiserId).in("status", ["pending", "unknown"]).gte("created_at", since).limit(1);
      if (open?.length) return json({ error: "A top-up for this account is still unresolved. Check TikTok before trying again.", code: "unresolved" }, 409);

      const { data: acct } = await supabase.from("tiktok_accounts").select("client_id").eq("tenant_id", agencyId).eq("advertiser_id", advertiserId).limit(1).maybeSingle();
      const { data: row, error: insErr } = await supabase.from("fund_transfers").insert({
        agency_id: agencyId, client_id: acct?.client_id ?? null, advertiser_id: advertiserId, advertiser_name: target.name,
        amount, type: "RECHARGE", status: "pending", created_by: userId,
      }).select("id, request_id").single();
      if (insErr || !row) return json({ error: "Could not record the top-up, nothing was sent" }, 500);

      let status: "sent" | "failed" | "unknown" = "unknown";
      let response: unknown = null;
      try {
        const d = await tt("/bc/transfer/", conn.access_token, {
          method: "POST",
          body: JSON.stringify({ bc_id: conn.bc_id, advertiser_id: advertiserId, transfer_type: "RECHARGE", cash_amount: amount, request_id: row.request_id }),
        });
        response = { code: d.code, message: d.message, request_id: d.request_id };
        status = d.code === 0 ? "sent" : "failed";
      } catch (e) {
        // Timeout or network cut: TikTok may or may not have applied it. Never guess; never auto-retry.
        response = { error: e instanceof Error ? e.message : String(e) };
      }
      await supabase.from("fund_transfers").update({ status, response }).eq("id", row.id);
      return json({ success: status === "sent", status, message: (response as any)?.message ?? null }, status === "failed" ? 502 : 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("tiktok-bc error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
