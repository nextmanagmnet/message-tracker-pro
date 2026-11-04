import { authorizeAgencyAdmin, authorizeClient, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { tiktokApi } from "../_shared/tiktokApi.ts";
import { pickFundingAgency, requestNotice, validateTopUpAmount } from "../_shared/topup.ts";
import { mapWalletError } from "../_shared/wallet.ts";

// A user asks the agency that funds their ad account to add money; the agency approves it in Funding
// (tiktok-bc `fund` with requestId, which runs the transfer safety checks) or declines it here.
// Creating a request charges the wallet (amount + fee) in the same database step; declining or cancelling refunds it.
// Body: { action: "routing", clientId, advertiserId } | { action: "create", clientId, advertiserId, amount, note? }
//     | { action: "cancel", requestId } | { action: "decline", requestId }

const DEFAULT_CAP = 1000;

interface RequestRow {
  id: string;
  client_id: string;
  funding_agency_id: string;
  status: string;
}

// The agency whose Business Center holds this ad account, and its per-transfer limit.
async function route(admin: ReturnType<typeof serviceClient>, advertiserId: string, requesterAgencyId: string) {
  const { data: seen } = await admin.from("bc_accounts").select("agency_id").eq("advertiser_id", advertiserId);
  const agencyId = pickFundingAgency(
    (seen ?? []).map((r: { agency_id: string }) => r.agency_id),
    requesterAgencyId,
  );
  if (!agencyId) return null;
  const { data: conn } = await admin
    .from("bc_connections")
    .select("max_transfer")
    .eq("agency_id", agencyId)
    .maybeSingle();
  return { agencyId, cap: Number(conn?.max_transfer) > 0 ? Number(conn?.max_transfer) : DEFAULT_CAP };
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const admin = serviceClient();

      if (body.action === "decline" || body.action === "cancel") {
        const { data: request } = await admin
          .from("topup_requests")
          .select("id, client_id, funding_agency_id, status")
          .eq("id", String(body.requestId ?? ""))
          .maybeSingle<RequestRow>();
        if (!request) return json({ error: "Request not found" }, 404);
        const auth =
          body.action === "decline"
            ? await authorizeAgencyAdmin(req, request.funding_agency_id, "funding")
            : await authorizeClient(req, request.client_id);
        if (auth instanceof Response) return auth;
        if (request.status !== "pending") return json({ error: "This request was already handled" }, 409);
        const status = body.action === "decline" ? "declined" : "cancelled";
        const { error } = await admin.rpc("settle_topup_request", {
          p_request: request.id,
          p_outcome: status,
          p_by: auth.userId,
        });
        if (error) {
          const mapped = mapWalletError(error);
          if (mapped) return json({ error: mapped.error, code: mapped.code }, mapped.status);
          throw error;
        }
        return json({ success: true, status });
      }

      if (body.action !== "routing" && body.action !== "create") return json({ error: "Unknown action" }, 400);

      const auth = await authorizeClient(req, body.clientId);
      if (auth instanceof Response) return auth;
      const advertiserId = String(body.advertiserId ?? "");
      const { data: client } = await admin
        .from("clients")
        .select("name, agency_id")
        .eq("id", body.clientId)
        .maybeSingle();
      const { data: account } = await admin
        .from("tiktok_accounts")
        .select("advertiser_id, advertiser_name, access_token")
        .eq("client_id", body.clientId)
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (!client || !account) return json({ error: "That ad account isn't connected to this client" }, 404);

      const found = await route(admin, advertiserId, client.agency_id);
      if (body.action === "routing") return json({ routed: !!found, maxAmount: found?.cap ?? null });
      // Nobody on WOB funds this account: the user pays in TikTok themselves (the UI shows how).
      if (!found) return json({ routed: false });

      const amount = body.amount;
      const problem = validateTopUpAmount(amount, found.cap);
      if (problem) return json({ error: problem }, 400);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";

      // The account's own currency, so the agency approves what TikTok will actually move.
      let currency = "USD";
      try {
        const info = await tiktokApi<{ list?: { currency?: string }[] }>("advertiser/info/", account.access_token, {
          params: { advertiser_ids: JSON.stringify([advertiserId]) },
        });
        if (/^[A-Z]{3}$/.test(info.list?.[0]?.currency ?? "")) currency = info.list![0].currency!;
      } catch {
        // keep USD; the transfer itself uses TikTok's real currency
      }

      // One database step: the request, its fee and the wallet debit, or none of them.
      const { data: requestId, error } = await admin.rpc("create_topup_request", {
        p_client: body.clientId,
        p_agency: found.agencyId,
        p_advertiser: advertiserId,
        p_advertiser_name: account.advertiser_name,
        p_by: auth.userId,
        p_amount: amount,
        p_currency: currency,
        p_note: note || null,
        p_client_name: client.name,
      });
      if (error) {
        const mapped = mapWalletError(error);
        if (mapped) return json({ error: mapped.error, code: mapped.code }, mapped.status);
        throw error;
      }
      const { data: row, error: readErr } = await admin
        .from("topup_requests")
        .select("id, status, amount, fee, currency, created_at")
        .eq("id", requestId)
        .single();
      if (readErr) throw readErr;

      const notice = requestNotice(client.name, account.advertiser_name, amount as number, currency);
      await admin.from("notifications").insert({
        agency_id: found.agencyId,
        client_id: body.clientId,
        type: "topup_request",
        title: notice.title,
        body: notice.body,
        data: { requestId: row.id, advertiserId },
      });
      return json({ routed: true, request: row });
    } catch (e) {
      console.error("topup-requests error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
