import { authorizeAgencyAdmin, authorizeClient, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { pickFundingAgency, validateTopUpAmount } from "../_shared/topup.ts";
import { isReferenceCode, mapWalletError, validatePaymentAmount, type WalletErrorCode } from "../_shared/wallet.ts";
import { WALLET_PROVIDERS } from "../_shared/walletProviders.ts";

// A user's wallet: balance, how to pay in, a fee quote, and (for agency staff) recording a bank payment.
// Body: { action: "info", clientId } | { action: "quote", clientId, advertiserId, amount }
//     | { action: "lookup", agencyId, referenceCode }
//     | { action: "record-payment", agencyId, referenceCode, amount, bankReference?, idempotencyKey, note? }
// Errors: { error, code? } with a 4xx status. Money only moves through the wallet_apply database function.

type Admin = ReturnType<typeof serviceClient>;

const fail = (error: string, code: WalletErrorCode | undefined, status = 400) => json({ error, code }, status);
const notFound = () => fail("Wallet not found", "not_found", 404);

interface SettingsRow {
  commission_percent: number | string;
  flat_fee: number | string;
  min_topup: number | string;
  payment_instructions: string | null;
}

async function ensureWallet(admin: Admin, clientId: string) {
  await admin.from("wallets").upsert({ client_id: clientId }, { onConflict: "client_id", ignoreDuplicates: true });
  const { data } = await admin
    .from("wallets")
    .select("currency, balance, reference_code")
    .eq("client_id", clientId)
    .single();
  return data as { currency: string; balance: number | string; reference_code: string } | null;
}

// The agency whose Business Center holds the client's ad account(s); the client's own agency breaks ties.
async function fundingAgencyOf(admin: Admin, clientId: string, ownAgencyId: string, onlyAdvertiser?: string) {
  let advertiserIds: string[];
  if (onlyAdvertiser) advertiserIds = [onlyAdvertiser];
  else {
    const { data } = await admin.from("tiktok_accounts").select("advertiser_id").eq("client_id", clientId);
    advertiserIds = (data ?? []).map((r: { advertiser_id: string }) => r.advertiser_id);
  }
  if (advertiserIds.length === 0) return null;
  const { data: seen } = await admin.from("bc_accounts").select("agency_id").in("advertiser_id", advertiserIds);
  return pickFundingAgency(
    (seen ?? []).map((r: { agency_id: string }) => r.agency_id),
    ownAgencyId,
  );
}

async function settingsOf(admin: Admin, agencyId: string | null) {
  if (!agencyId) return null;
  const { data } = await admin
    .from("agency_wallet_settings")
    .select("commission_percent, flat_fee, min_topup, payment_instructions")
    .eq("agency_id", agencyId)
    .maybeSingle<SettingsRow>();
  return data ?? null;
}

// Agency staff may only see wallets of clients they serve: their own clients, or clients whose ad account
// sits in one of their Business Centers.
async function agencyServes(admin: Admin, agencyId: string, clientId: string, clientAgencyId: string) {
  if (clientAgencyId === agencyId) return true;
  const { data: accts } = await admin.from("tiktok_accounts").select("advertiser_id").eq("client_id", clientId);
  const ids = (accts ?? []).map((r: { advertiser_id: string }) => r.advertiser_id);
  if (ids.length === 0) return false;
  const { data } = await admin
    .from("bc_accounts")
    .select("advertiser_id")
    .eq("agency_id", agencyId)
    .in("advertiser_id", ids)
    .limit(1);
  return (data ?? []).length > 0;
}

// The wallet behind a reference code, only when this agency serves its client.
async function walletByCode(admin: Admin, agencyId: string, referenceCode: string) {
  const { data: w } = await admin
    .from("wallets")
    .select("client_id, currency, balance")
    .eq("reference_code", referenceCode)
    .maybeSingle<{ client_id: string; currency: string; balance: number | string }>();
  if (!w) return null;
  const { data: client } = await admin
    .from("clients")
    .select("name, agency_id")
    .eq("id", w.client_id)
    .maybeSingle<{ name: string; agency_id: string }>();
  if (!client || !(await agencyServes(admin, agencyId, w.client_id, client.agency_id))) return null;
  return { ...w, clientName: client.name };
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const admin = serviceClient();

      if (body.action === "info" || body.action === "quote") {
        const auth = await authorizeClient(req, body.clientId);
        if (auth instanceof Response) return auth;
        const clientId: string = body.clientId;
        const { data: client } = await admin.from("clients").select("agency_id").eq("id", clientId).maybeSingle();
        if (!client) return notFound();
        const wallet = await ensureWallet(admin, clientId);
        if (!wallet) throw new Error("Could not open the wallet");
        const balance = Number(wallet.balance);

        if (body.action === "info") {
          const fundingAgencyId = await fundingAgencyOf(admin, clientId, client.agency_id);
          const s = await settingsOf(admin, fundingAgencyId);
          return json({
            currency: wallet.currency,
            balance,
            referenceCode: wallet.reference_code,
            fundingAgencyId,
            settings: s && {
              commissionPercent: Number(s.commission_percent),
              flatFee: Number(s.flat_fee),
              minTopup: Number(s.min_topup),
              paymentInstructions: s.payment_instructions,
            },
          });
        }

        const advertiserId = String(body.advertiserId ?? "");
        const { data: account } = await admin
          .from("tiktok_accounts")
          .select("advertiser_id")
          .eq("client_id", clientId)
          .eq("advertiser_id", advertiserId)
          .maybeSingle();
        if (!account) return fail("That ad account isn't connected to this client", "not_found", 404);
        const problem = validateTopUpAmount(body.amount, Number.POSITIVE_INFINITY);
        if (problem) return fail(problem, "invalid");
        const amount: number = body.amount;
        const agencyId = await fundingAgencyOf(admin, clientId, client.agency_id, advertiserId);
        if (!agencyId) {
          return json({
            routed: false,
            amount,
            fee: 0,
            total: amount,
            balance,
            currency: wallet.currency,
            enough: false,
            minTopup: 0,
          });
        }
        const [{ data: fee, error: feeErr }, s] = await Promise.all([
          admin.rpc("topup_fee", { p_agency: agencyId, p_amount: amount }),
          settingsOf(admin, agencyId),
        ]);
        if (feeErr) throw feeErr;
        const total = Math.round((amount + Number(fee)) * 100) / 100;
        return json({
          routed: true,
          amount,
          fee: Number(fee),
          total,
          balance,
          currency: wallet.currency,
          enough: balance >= total,
          minTopup: s ? Number(s.min_topup) : 1,
        });
      }

      if (body.action === "lookup" || body.action === "record-payment") {
        const auth = await authorizeAgencyAdmin(req, body.agencyId);
        if (auth instanceof Response) return auth;
        if (!isReferenceCode(body.referenceCode)) return fail("Enter a reference code like W-A1B2C3", "invalid");
        const found = await walletByCode(admin, body.agencyId, body.referenceCode);
        if (!found) return notFound();

        if (body.action === "lookup") {
          return json({ clientName: found.clientName, balance: Number(found.balance), currency: found.currency });
        }

        const problem = validatePaymentAmount(body.amount);
        if (problem) return fail(problem, "invalid");
        const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
        if (!key || key.length > 100) return fail("A request key is required", "invalid");
        const bank = typeof body.bankReference === "string" ? body.bankReference.trim() : "";
        if (bank.length > 100) return fail("The bank reference is too long", "invalid");
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
        const { data, error } = await admin.rpc("wallet_apply", {
          p_client: found.client_id,
          p_amount: body.amount,
          p_kind: "topup",
          p_provider: WALLET_PROVIDERS.manual.id,
          p_provider_ref: bank || key,
          p_note: note || null,
          p_by: auth.userId,
          p_request: null,
        });
        if (error) {
          const mapped = mapWalletError(error);
          if (mapped) return fail(mapped.error, mapped.code, mapped.status);
          throw error;
        }
        const row = (data as { out_balance: number | string; out_duplicate: boolean }[])[0];
        return json({ balance: Number(row.out_balance), duplicate: row.out_duplicate });
      }

      return fail("Unknown action", "invalid");
    } catch (e) {
      console.error("wallet error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
