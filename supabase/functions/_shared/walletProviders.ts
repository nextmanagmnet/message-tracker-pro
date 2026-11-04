// The seam for payment providers. Today only the bank-transfer ("manual") provider exists: an agency records
// the payment by hand. A future gateway (local or global) adds an entry here and a webhook that calls
// creditFromPayment once the gateway confirms a payment.
export interface WalletProvider {
  id: string;
  label: string;
  kind: "manual" | "gateway";
}

export const WALLET_PROVIDERS: Record<string, WalletProvider> = {
  manual: { id: "manual", label: "Bank transfer", kind: "manual" },
};

export interface PaymentCredit {
  provider: string;
  providerRef: string; // the gateway's payment id / bank reference: the same one is credited only once
  clientId: string;
  amount: number;
  currency: string;
}

// The wallet_apply arguments for a confirmed payment, or the reason it can't be credited. Pure.
export function creditArgs(p: PaymentCredit, walletCurrency: string) {
  if (!WALLET_PROVIDERS[p.provider]) return { error: `Unknown payment provider: ${p.provider}` };
  if (!p.providerRef.trim()) return { error: "A payment reference is required" };
  if (!Number.isFinite(p.amount) || p.amount <= 0) return { error: "Amount must be above zero" };
  if (p.currency !== walletCurrency) return { error: "Payment currency differs from the wallet's currency" };
  return {
    args: {
      p_client: p.clientId,
      p_amount: p.amount,
      p_kind: "topup",
      p_provider: p.provider,
      p_provider_ref: p.providerRef,
      p_note: null,
      p_by: null,
      p_request: null,
    },
  };
}

type Rpc = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

// What a future webhook calls (with the service client, after verifying the gateway's signature). Idempotent
// by (provider, providerRef): a retried notice returns duplicate = true and changes nothing.
export async function creditFromPayment(
  admin: Rpc,
  p: PaymentCredit,
  walletCurrency: string,
): Promise<{ balance: number; duplicate: boolean }> {
  const built = creditArgs(p, walletCurrency);
  if (!built.args) throw new Error(built.error);
  const { data, error } = await admin.rpc("wallet_apply", built.args);
  if (error) throw new Error(error.message);
  const row = (data as { out_balance: number; out_duplicate: boolean }[])[0];
  return { balance: Number(row.out_balance), duplicate: row.out_duplicate };
}
