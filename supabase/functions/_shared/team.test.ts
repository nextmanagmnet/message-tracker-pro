import { describe, expect, it } from "vitest";
import { parseAccess, parseTeamInvite } from "./team";

describe("parseTeamInvite", () => {
  it("lowercases the email and keeps known permissions in a stable order", () => {
    expect(
      parseTeamInvite({ email: "  Sara@Example.com ", role: "admin", permissions: ["funding", "clients"] }),
    ).toEqual({
      ok: true,
      value: { email: "sara@example.com", role: "admin", permissions: ["clients", "funding"] },
    });
  });

  it("an admin needs at least one permission", () => {
    expect(parseTeamInvite({ email: "a@b.co", role: "admin", permissions: [] }).ok).toBe(false);
    expect(parseTeamInvite({ email: "a@b.co", role: "admin" }).ok).toBe(false);
  });

  it("refuses an unknown permission instead of ignoring it", () => {
    expect(parseTeamInvite({ email: "a@b.co", role: "admin", permissions: ["funding", "owner"] }).ok).toBe(false);
  });

  it("a viewer never carries permissions", () => {
    expect(parseTeamInvite({ email: "a@b.co", role: "viewer", permissions: ["funding"] })).toEqual({
      ok: true,
      value: { email: "a@b.co", role: "viewer", permissions: [] },
    });
  });

  it("owner cannot be invited and the email must be valid", () => {
    expect(parseTeamInvite({ email: "a@b.co", role: "owner" }).ok).toBe(false);
    expect(parseTeamInvite({ email: "nope", role: "viewer" }).ok).toBe(false);
  });
});

describe("parseAccess (changing an existing member)", () => {
  it("needs no email", () => {
    expect(parseAccess({ role: "admin", permissions: ["ad_accounts"] })).toEqual({
      ok: true,
      value: { role: "admin", permissions: ["ad_accounts"] },
    });
  });
  it("cannot promote to owner", () => {
    expect(parseAccess({ role: "owner", permissions: ["funding"] }).ok).toBe(false);
  });
});
