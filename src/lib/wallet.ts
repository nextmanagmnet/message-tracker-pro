export type EntryKind = "topup" | "request" | "refund" | "adjustment";

/** Ledger kinds the UI has a plain-language label for; anything else falls back to "adjustment". */
export const entryKind = (k: string): EntryKind =>
  k === "topup" || k === "request" || k === "refund" ? k : "adjustment";

/** The fee an agency charges on an amount, rounded to cents like the database does. */
export const feeFor = (amount: number, commissionPercent: number, flatFee: number) =>
  Math.round(amount * commissionPercent + flatFee * 100) / 100;

export type SettingsForm = { commission: string; flatFee: string; minTopup: string; instructions: string };
export type SettingsError = "commission" | "flatFee" | "minTopup" | "instructions";

/** Mirrors the agency_wallet_settings CHECK constraints so a bad value is caught before the round trip. */
export function validateSettings(s: SettingsForm): SettingsError | null {
  const c = Number(s.commission);
  const fee = Number(s.flatFee);
  const min = Number(s.minTopup);
  if (s.commission.trim() === "" || !Number.isFinite(c) || c < 0 || c > 50) return "commission";
  if (s.flatFee.trim() === "" || !Number.isFinite(fee) || fee < 0) return "flatFee";
  if (s.minTopup.trim() === "" || !Number.isFinite(min) || min <= 0) return "minTopup";
  if (s.instructions.length > 1000) return "instructions";
  return null;
}
