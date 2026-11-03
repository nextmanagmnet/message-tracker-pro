// Pure rules for top-up requests (no Deno or network APIs, so Vitest can run them).

// An amount a user may ask for: a positive number with at most two decimals, within the funding agency's
// per-transfer limit (the same cap approval enforces, so a request that can't be approved is never made).
export function validateTopUpAmount(amount: unknown, cap: number): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "Enter an amount above zero";
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return "Use at most two decimal places";
  if (amount > cap) return `The most you can request at once is ${cap}`;
  return null;
}

// Which agency's Business Center funds an ad account, from the accounts WOB has seen under each agency's BCs.
// Exactly one agency: it. Several (an account shared across Business Centers): the requester's own agency
// when it is among them, otherwise none, never a guess.
export function pickFundingAgency(agencyIds: string[], requesterAgencyId: string): string | null {
  const unique = [...new Set(agencyIds)];
  if (unique.length === 1) return unique[0];
  return unique.includes(requesterAgencyId) ? requesterAgencyId : null;
}

export function requestNotice(clientName: string, accountName: string | null, amount: number, currency: string) {
  const who = clientName || "A client";
  return {
    title: `Top-up request: ${amount} ${currency}`,
    body: `${who} asked to add ${amount} ${currency} to ${accountName ?? "an ad account"}.`,
  };
}
