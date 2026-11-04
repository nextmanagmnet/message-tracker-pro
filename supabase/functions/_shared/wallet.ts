// Pure wallet rules (no Deno or network APIs, so Vitest can run them). The money itself moves in the database
// (wallet_apply / create_topup_request / settle_topup_request); nothing here changes a balance.

export const MAX_PAYMENT = 10000; // the most one recorded payment may credit
export const REFERENCE_CODE = /^W-[A-Z0-9]{6}$/;

export type WalletErrorCode =
  "insufficient_funds" | "currency_mismatch" | "below_minimum" | "already_pending" | "not_found" | "invalid";

export interface FeeSettings {
  commissionPercent: number;
  flatFee: number;
}

// Mirrors SQL topup_fee: round(amount * commission_percent / 100 + flat_fee, 2). Preview/tests only: the
// database is the source of truth for what is charged.
export function feeFor(amount: number, settings: FeeSettings | null): number {
  if (!settings) return 0;
  const raw = (amount * settings.commissionPercent) / 100 + settings.flatFee;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

// A payment an agency records: positive, at most two decimals, within MAX_PAYMENT.
export function validatePaymentAmount(amount: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "Enter an amount above zero";
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return "Use at most two decimal places";
  if (amount > MAX_PAYMENT) return `The most you can record at once is ${MAX_PAYMENT}`;
  return null;
}

export const isReferenceCode = (v: unknown): v is string => typeof v === "string" && REFERENCE_CODE.test(v);

interface Mapped {
  status: number;
  error: string;
  code?: WalletErrorCode;
}

const MESSAGES: Record<string, Mapped> = {
  insufficient_funds: {
    status: 400,
    error: "Your wallet doesn't have enough for this amount and fee",
    code: "insufficient_funds",
  },
  currency_mismatch: {
    status: 400,
    error: "This ad account's currency differs from your wallet's currency",
    code: "currency_mismatch",
  },
  below_minimum: { status: 400, error: "That is below the minimum top-up", code: "below_minimum" },
};

// Maps a database error to a coded 4xx response, or null when it isn't one of ours (then it's a real 500).
export function mapWalletError(e: { message?: string; code?: string } | null | undefined): Mapped | null {
  if (!e) return null;
  if (e.code === "23505") {
    return { status: 409, error: "A request for this ad account is already waiting", code: "already_pending" };
  }
  if (e.message?.includes("not_pending")) return { status: 409, error: "This request was already handled" };
  for (const key of Object.keys(MESSAGES)) if (e.message?.includes(key)) return MESSAGES[key];
  return null;
}
