import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeAgencyAdmin } from "../_shared/auth.ts";
import { checkFundAmount, extractList, parseBcList, resolveOwningBc, scopeBcs } from "../_shared/bcFunding.ts";
import { advertiserBalance, loadAllBcs, loadBcCredits, saveBcAccounts, TIKTOK_API, tt } from "../_shared/bcAccounts.ts";
import { withCors } from "../_shared/cors.ts";
import { mapWalletError } from "../_shared/wallet.ts";

// Agency-level TikTok Business Center: connect it, list ad-account balances, top accounts up.
// Body: { action, agencyId, ... }. Only agency owners/admins; the token never leaves the server.
const API = TIKTOK_API;

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

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const { action } = body;
      const auth = await authorizeAgencyAdmin(req, body.agencyId, "funding");
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
        // TikTok sometimes answers with plain text (for example when it blocks the server's address): show that.
        const raw = await res.text();
        // deno-lint-ignore no-explicit-any
        let t: any;
        try {
          t = JSON.parse(raw);
        } catch {
          console.error("TikTok token exchange returned non-JSON:", res.status, raw.slice(0, 300));
          return json({ error: `TikTok refused the connection: ${raw.slice(0, 200)}`, code: "tiktok_refused" }, 502);
        }
        if (t.code !== 0)
          return json({ error: "TikTok rejected the login. Try connecting again.", details: t.message }, 400);
        const token: string = t.data.access_token;

        // Business Centers this login can see (all of them are used for funding).
        const list = await tt("/bc/get/", token).catch(() => null);
        const bcs = parseBcList(list?.data);
        // Several Business Centers: the agency picks which to use (kept when a reconnect still has them), never "all".
        const kept = ((conn?.selected_bc_ids ?? []) as string[]).filter((id) => bcs.some((b) => b.bcId === id));
        const selected = kept.length ? kept : bcs.length > 1 ? [] : null;
        const row = {
          agency_id: agencyId,
          selected_bc_ids: selected,
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
        // Users linked to this agency run on its login: give them the new token so they keep working.
        await supabase.from("tiktok_accounts").update({ access_token: token }).eq("managed_by_agency_id", agencyId);
        return json({
          success: true,
          bcId: row.bc_id,
          businessCenters: bcs.length,
          needsChoice: selected?.length === 0,
        });
      }

      if (action === "disconnect") {
        // Linked users run on copies of this login: end every active link first so those copies are deleted with it.
        const { data: links } = await supabase
          .from("agency_client_links")
          .select("id")
          .eq("agency_id", agencyId)
          .eq("status", "active");
        for (const l of links ?? []) await supabase.rpc("end_agency_link", { p_link: l.id, p_by: "agency" });
        await supabase.from("bc_connections").delete().eq("agency_id", agencyId);
        return json({ success: true });
      }

      if (action === "resolve-request") {
        // A request stuck in 'approving' after an unknown transfer result: staff checked TikTok and say what happened.
        const outcome = body.outcome;
        if (outcome !== "approved" && outcome !== "failed")
          return json({ error: "outcome must be approved or failed" }, 400);
        const { data: stuck } = await supabase
          .from("topup_requests")
          .select("id, status, funding_agency_id, fund_transfer_id")
          .eq("id", String(body.requestId ?? ""))
          .maybeSingle();
        if (!stuck || stuck.funding_agency_id !== agencyId) return json({ error: "Top-up request not found" }, 404);
        if (stuck.status !== "approving") return json({ error: "This request was already handled" }, 409);
        if (stuck.fund_transfer_id)
          await supabase
            .from("fund_transfers")
            .update({ status: outcome === "approved" ? "sent" : "failed" })
            .eq("id", stuck.fund_transfer_id);
        if (outcome === "approved") {
          const { data: done } = await supabase
            .from("topup_requests")
            .update({ status: "approved", decided_by: userId, decided_at: new Date().toISOString(), error: null })
            .eq("id", stuck.id)
            .eq("status", "approving")
            .select("id");
          if (!done?.length) return json({ error: "This request was already handled" }, 409);
          return json({ success: true, status: "approved" });
        }
        // Not sent: back to pending, then the database refunds the wallet.
        const { data: back } = await supabase
          .from("topup_requests")
          .update({ status: "pending", error: "Marked as not sent after checking TikTok" })
          .eq("id", stuck.id)
          .eq("status", "approving")
          .select("id");
        if (!back?.length) return json({ error: "This request was already handled" }, 409);
        const { error: refundErr } = await supabase.rpc("settle_topup_request", {
          p_request: stuck.id,
          p_outcome: "failed",
          p_by: userId,
        });
        if (refundErr) {
          const mapped = mapWalletError(refundErr);
          if (mapped) return json({ error: mapped.error, code: mapped.code }, mapped.status);
          throw refundErr;
        }
        return json({ success: true, status: "failed" });
      }

      if (!conn) return json({ error: "Connect your TikTok Business Center first", code: "not_connected" }, 400);

      // The Business Centers this login can see, with which ones the agency uses (for the chooser).
      if (action === "list-bcs") {
        const l = await tt("/bc/get/", conn.access_token).catch((e) => ({ code: -1, message: String(e) }));
        if (l.code !== 0) return json({ error: l.message ?? "TikTok error", code: "tiktok_error" }, 502);
        const chosen: string[] | null = conn.selected_bc_ids ?? null;
        return json({
          pending: chosen?.length === 0,
          businessCenters: parseBcList(l.data).map((b) => ({
            bcId: b.bcId,
            name: b.name,
            canFinance: b.canFinance,
            selected: chosen === null ? true : chosen.includes(b.bcId),
          })),
        });
      }

      if (action === "select-bcs") {
        const ids: unknown = body.bcIds;
        if (!Array.isArray(ids) || !ids.length || !ids.every((i) => typeof i === "string"))
          return json({ error: "Choose at least one Business Center" }, 400);
        const l = await tt("/bc/get/", conn.access_token).catch((e) => ({ code: -1, message: String(e) }));
        if (l.code !== 0) return json({ error: l.message ?? "TikTok error", code: "tiktok_error" }, 502);
        // Only Business Centers this login really administers can be picked.
        const valid = new Set(parseBcList(l.data).map((b) => b.bcId));
        const picked = [...new Set(ids as string[])].filter((i) => valid.has(i));
        if (!picked.length) return json({ error: "Choose at least one Business Center" }, 400);
        const first = parseBcList(l.data).find((b) => b.bcId === picked[0]);
        await supabase
          .from("bc_connections")
          .update({
            selected_bc_ids: picked,
            bc_id: picked.length === 1 ? picked[0] : null,
            bc_name: picked.length === 1 ? (first?.name ?? null) : null,
          })
          .eq("agency_id", agencyId);
        // Top-up requests from other agencies find their funder through this table: drop the BCs no longer used.
        await supabase
          .from("bc_accounts")
          .delete()
          .eq("agency_id", agencyId)
          .not("bc_id", "in", `(${picked.join(",")})`);
        return json({ success: true });
      }

      // Everything below moves or reads money: it waits until the agency has chosen its Business Centers.
      if (["account-balance", "bc-balances", "balances", "fund"].includes(action) && conn.selected_bc_ids?.length === 0)
        return json({ error: "Choose which Business Centers to use first", code: "choose_bc" }, 409);

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

      // What a top-up dialog needs to show before money moves: the account's credit and its Business Center's.
      if (action === "account-balance") {
        const advertiserId = String(body.advertiserId ?? "");
        const { data: row } = await supabase
          .from("bc_accounts")
          .select("bc_id, bc_name")
          .eq("agency_id", agencyId)
          .eq("advertiser_id", advertiserId)
          .maybeSingle();
        if (!row) return json({ error: "That ad account is not in your Business Center", code: "not_found" }, 404);
        const [account, credits] = await Promise.all([
          advertiserBalance(row.bc_id, conn.access_token, advertiserId).catch(() => null),
          loadBcCredits(conn.access_token, conn.selected_bc_ids).catch(() => null),
        ]);
        const bc = credits?.bcs.find((b) => b.bcId === row.bc_id);
        return json({
          bcName: row.bc_name,
          account: account
            ? { balance: account.balance, currency: account.currency, minTransferable: account.minTransferable }
            : null,
          bc: bc ? { balance: bc.balance, currency: bc.currency, error: bc.error } : null,
        });
      }

      if (action === "bc-balances") {
        const r = await loadBcCredits(conn.access_token, conn.selected_bc_ids);
        if (r.error) return json({ error: r.error, code: "tiktok_error" }, 502);
        return json({ businessCenters: r.bcs });
      }

      if (action === "balances") {
        const all = await loadAllBcs(conn.access_token, conn.selected_bc_ids);
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
        await saveBcAccounts(supabase, agencyId, all.bcs);
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
            .select("funding_agency_id, advertiser_id, status")
            .eq("id", requestId)
            .maybeSingle();
          if (!req || req.funding_agency_id !== agencyId || req.advertiser_id !== advertiserId)
            return json({ error: "Top-up request not found" }, 404);
          // Claim it before anything else: from here nobody can cancel or decline it, and a second approve is refused.
          const { data: claimed } = await supabase
            .from("topup_requests")
            .update({ status: "approving" })
            .eq("id", requestId)
            .eq("status", "pending")
            .eq("funding_agency_id", agencyId)
            .select("amount, fee");
          if (!claimed?.length) return json({ error: "This request was already handled" }, 409);
          amount = Number(claimed[0].amount);
        }
        // Give the claim back (still pending, so it can be retried or declined) when nothing was sent.
        const release = async (res: Response) => {
          if (requestId)
            await supabase
              .from("topup_requests")
              .update({ status: "pending" })
              .eq("id", requestId)
              .eq("status", "approving");
          return res;
        };
        let attempted = false;
        try {
          // The account's OWN Business Center, found server-side from what each BC administers; the browser sends no bc_id.
          const all = await loadAllBcs(conn.access_token, conn.selected_bc_ids);
          if (all.error) return release(json({ error: all.error }, 502));
          const target = resolveOwningBc(
            all.bcs.flatMap((b) => b.accounts),
            advertiserId,
          );
          if (!target)
            return release(json({ error: "That ad account is not under a Business Center you can fund from" }, 400));
          const bad = checkFundAmount(amount, Number(conn.max_transfer), target.minTransferable);
          if (bad) return release(json({ error: bad }, 400));

          // Checking for an unresolved transfer and recording this one is a single locked database step, so two
          // simultaneous clicks (or two staff) can never both send. Staff must look at TikTok before retrying.
          const { data: acct } = await supabase
            .from("tiktok_accounts")
            .select("client_id")
            .eq("tenant_id", agencyId)
            .eq("advertiser_id", advertiserId)
            .limit(1)
            .maybeSingle();
          const { data: begun, error: insErr } = await supabase.rpc("begin_fund_transfer", {
            p_agency: agencyId,
            p_client: acct?.client_id ?? null,
            p_advertiser: advertiserId,
            p_name: target.name,
            p_bc_id: target.bcId,
            p_bc_name: target.bcName,
            p_amount: amount,
            p_by: userId,
          });
          if (insErr?.message?.includes("unresolved"))
            return release(
              json(
                {
                  error: "A top-up for this account is still unresolved. Check TikTok before trying again.",
                  code: "unresolved",
                },
                409,
              ),
            );
          if (insErr?.message?.includes("daily_limit")) {
            const [used, cap] = String(insErr.details ?? "").split("/");
            return release(
              json(
                {
                  error: `The daily transfer limit would be exceeded (${used || "?"} of ${cap || "?"} used in the last 24 hours). Ask the agency owner to raise it in Settings, or try again later.`,
                  code: "daily_limit",
                },
                409,
              ),
            );
          }
          const row = (begun as { out_id: string; out_request_id: string }[] | null)?.[0];
          if (insErr || !row) return release(json({ error: "Could not record the top-up, nothing was sent" }, 500));

          let status: "sent" | "failed" | "unknown" = "unknown";
          let response: { code?: number; message?: string; request_id?: string; error?: string } | null = null;
          attempted = true;
          try {
            const d = await tt("/bc/transfer/", conn.access_token, {
              method: "POST",
              body: JSON.stringify({
                bc_id: target.bcId,
                advertiser_id: advertiserId,
                transfer_type: "RECHARGE",
                cash_amount: amount,
                request_id: row.out_request_id,
              }),
            });
            response = { code: d.code, message: d.message, request_id: d.request_id };
            status = d.code === 0 ? "sent" : "failed";
          } catch (e) {
            // Timeout or network cut: TikTok may or may not have applied it. Never guess; never auto-retry.
            response = { error: e instanceof Error ? e.message : String(e) };
          }
          await supabase.from("fund_transfers").update({ status, response }).eq("id", row.out_id);
          if (requestId && status === "sent")
            // The wallet was charged when the request was made; the fee stays with the agency.
            await supabase
              .from("topup_requests")
              .update({
                status: "approved",
                decided_by: userId,
                decided_at: new Date().toISOString(),
                fund_transfer_id: row.out_id,
                error: null,
              })
              .eq("id", requestId)
              .eq("status", "approving");
          else if (requestId && status === "failed")
            // TikTok said no: back to pending so staff can retry or decline (which refunds the wallet).
            await supabase
              .from("topup_requests")
              .update({ status: "pending", error: response?.message ?? "TikTok rejected the transfer" })
              .eq("id", requestId)
              .eq("status", "approving");
          else if (requestId)
            // Unknown: stays 'approving' (nobody can cancel or decline) until staff check TikTok and resolve it.
            await supabase.from("topup_requests").update({ fund_transfer_id: row.out_id }).eq("id", requestId);
          return json(
            {
              success: status === "sent",
              status,
              message:
                status === "unknown" && requestId
                  ? "The result is unknown. The request stays in approving: check TikTok, then resolve it."
                  : (response?.message ?? null),
            },
            status === "failed" ? 502 : 200,
          );
        } catch (e) {
          if (!attempted) await release(json({}));
          throw e;
        }
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      console.error("tiktok-bc error", e);
      // Details stay in the server log; the browser never sees internal error text.
      return json({ error: "Something went wrong. Check the transfer history before trying again." }, 500);
    }
  }),
);
