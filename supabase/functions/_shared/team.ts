// Team invites: what an owner may ask for, validated before anything is written.
// Roles and permission names mirror the database (team_invites, has_agency_permission).

export const PERMISSIONS = ["clients", "funding", "ad_accounts", "campaigns"] as const;
export type TeamPermission = (typeof PERMISSIONS)[number];
export type TeamRole = "admin" | "viewer";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type TeamAccess = { role: TeamRole; permissions: TeamPermission[] };
export type TeamInvite = TeamAccess & { email: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * An admin must hold at least one permission (otherwise they'd be a viewer by another name).
 * A viewer never carries permissions, whatever was sent. "owner" can never be granted.
 */
export function parseAccess(body: { role?: unknown; permissions?: unknown }): Parsed<TeamAccess> {
  if (body.role !== "admin" && body.role !== "viewer") return { ok: false, error: "Choose a role" };
  if (body.role === "viewer") return { ok: true, value: { role: "viewer", permissions: [] } };

  const asked = Array.isArray(body.permissions) ? body.permissions : [];
  if (asked.some((p) => !PERMISSIONS.includes(p as TeamPermission))) return { ok: false, error: "Unknown permission" };
  const permissions = PERMISSIONS.filter((p) => asked.includes(p));
  if (permissions.length === 0) return { ok: false, error: "Choose at least one permission" };
  return { ok: true, value: { role: "admin", permissions } };
}

export function parseTeamInvite(body: { email?: unknown; role?: unknown; permissions?: unknown }): Parsed<TeamInvite> {
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email address" };
  const access = parseAccess(body);
  return access.ok ? { ok: true, value: { email, ...access.value } } : access;
}
