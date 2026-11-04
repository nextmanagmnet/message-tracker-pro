import { describe, expect, it } from "vitest";
import { buildAccountList, hashToken, isTokenShape, joinUrl, mapJoinError, newInviteToken } from "./agencyLinks";

describe("invite tokens", () => {
  it("makes 64 hex chars, unique, and hashes to sha256 hex", async () => {
    const t = newInviteToken();
    expect(isTokenShape(t)).toBe(true);
    expect(newInviteToken()).not.toBe(t);
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(isTokenShape("ABC")).toBe(false);
  });
});

describe("joinUrl", () => {
  it("uses the first origin without a trailing slash", () => {
    expect(joinUrl("https://a.com/, https://b.com", "t")).toBe("https://a.com/join?token=t");
    expect(joinUrl("", "t")).toBeNull();
    expect(joinUrl(undefined, "t")).toBeNull();
  });
});

describe("buildAccountList", () => {
  const acc = (id: string) => ({ advertiser_id: id, advertiser_name: id === "5" ? null : `N${id}`, bc_id: "b" });
  const future = new Date(Date.now() + 1e7).toISOString();
  const past = new Date(Date.now() - 1e7).toISOString();
  it("derives each status", () => {
    const r = buildAccountList(
      [acc("1"), acc("2"), acc("3"), acc("4"), acc("5")],
      [
        { id: "i2", advertiser_id: "2", created_at: "c", expires_at: future },
        { id: "i4", advertiser_id: "4", created_at: "c", expires_at: past },
      ],
      [
        { id: "l1", advertiser_id: "1", status: "active", linked_at: "x" },
        { id: "l3", advertiser_id: "3", status: "revoked", linked_at: "x" },
      ],
    );
    expect(r.accounts.map((a) => a.status)).toEqual(["joined", "invited", "revoked", "not_invited", "not_invited"]);
    expect(r.accounts[4].name).toBe("5");
    expect(r.counts).toEqual({ total: 5, notInvited: 3, invited: 1, joined: 1 });
  });
});

describe("mapJoinError", () => {
  it("maps database errors", () => {
    expect(mapJoinError({ message: "invite_invalid" })?.code).toBe("invite_invalid");
    expect(mapJoinError({ message: "account_not_in_agency" })?.code).toBe("invite_invalid");
    expect(mapJoinError({ message: "own_agency" })?.status).toBe(400);
    expect(mapJoinError({ message: "already_linked" })?.status).toBe(409);
    expect(mapJoinError({ message: "WOB_LIMIT: x" })?.code).toBe("limit");
    expect(mapJoinError({ message: "boom" })).toBeNull();
  });
});
