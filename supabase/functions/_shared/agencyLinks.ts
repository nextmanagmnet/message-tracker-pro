// Pure helpers for agency-links / agency-join: invite tokens, join URLs, list statuses, database error mapping.

export type InviteStatus = "not_invited" | "invited" | "joined" | "revoked";

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** 32 random bytes as 64 hex chars. Shown once; only its hash is stored. */
export function newInviteToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

/** sha256 of the token as hex: the value stored in ad_account_invites.token_hash. */
export async function hashToken(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

/** The join link on the first APP_ORIGINS entry (no trailing slash). Null when APP_ORIGINS is unset. */
export function joinUrl(appOrigins: string | null | undefined, token: string): string | null {
  const origin = (appOrigins ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .find(Boolean);
  return origin ? `${origin}/join?token=${token}` : null;
}

/** Tokens are exactly 64 lowercase hex chars; anything else cannot be valid. */
export const isTokenShape = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{64}$/.test(t);

export interface ListInvite {
  id: string;
  advertiser_id: string;
  created_at: string;
  expires_at: string;
}
export interface ListLink {
  id: string;
  advertiser_id: string;
  status: string;
  linked_at: string;
}
export interface ListAccount {
  advertiser_id: string;
  advertiser_name: string | null;
  bc_id: string;
  bc_name?: string | null;
}
export interface ListedAccount {
  advertiserId: string;
  name: string;
  bcId: string;
  bcName: string | null;
  status: InviteStatus;
  inviteId?: string;
  invitedAt?: string;
  expiresAt?: string;
  linkId?: string;
  linkedAt?: string;
}

/** joined = an active link; invited = an open, unexpired invite; revoked = only ended links; else not_invited. */
export function buildAccountList(
  accounts: ListAccount[],
  invites: ListInvite[],
  links: ListLink[],
  now: number = Date.now(),
): { accounts: ListedAccount[]; counts: { total: number; notInvited: number; invited: number; joined: number } } {
  const open = new Map(invites.filter((i) => Date.parse(i.expires_at) > now).map((i) => [i.advertiser_id, i]));
  const active = new Map(links.filter((l) => l.status === "active").map((l) => [l.advertiser_id, l]));
  const ended = new Set(links.filter((l) => l.status !== "active").map((l) => l.advertiser_id));
  const out = accounts.map((a): ListedAccount => {
    const base = {
      advertiserId: a.advertiser_id,
      name: a.advertiser_name ?? a.advertiser_id,
      bcId: a.bc_id,
      bcName: a.bc_name ?? null,
    };
    const link = active.get(a.advertiser_id);
    if (link) return { ...base, status: "joined", linkId: link.id, linkedAt: link.linked_at };
    const inv = open.get(a.advertiser_id);
    if (inv)
      return { ...base, status: "invited", inviteId: inv.id, invitedAt: inv.created_at, expiresAt: inv.expires_at };
    return { ...base, status: ended.has(a.advertiser_id) ? "revoked" : "not_invited" };
  });
  const n = (s: InviteStatus) => out.filter((a) => a.status === s).length;
  return {
    accounts: out,
    counts: {
      total: out.length,
      notInvited: n("not_invited") + n("revoked"),
      invited: n("invited"),
      joined: n("joined"),
    },
  };
}

export interface JoinError {
  status: number;
  error: string;
  code: string;
}

export const INVITE_INVALID: JoinError = {
  status: 400,
  error: "This invite link is no longer valid. Ask your agency for a new one.",
  code: "invite_invalid",
};

/** Maps accept_agency_invite's database errors to the response the app shows; null = not one of ours. */
export function mapJoinError(e: { message?: string } | null | undefined): JoinError | null {
  const m = e?.message ?? "";
  if (m.includes("WOB_LIMIT"))
    return {
      status: 409,
      error: "Your plan allows one TikTok ad account. Disconnect the current one first.",
      code: "limit",
    };
  if (m.includes("invite_invalid") || m.includes("account_not_in_agency")) return INVITE_INVALID;
  if (m.includes("own_agency"))
    return { status: 400, error: "This ad account is managed by your own agency.", code: "own_agency" };
  if (m.includes("already_linked"))
    return { status: 409, error: "This ad account is already linked to another WOB user.", code: "already_linked" };
  return null;
}
