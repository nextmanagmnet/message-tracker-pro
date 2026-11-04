import { describe, expect, it } from "vitest";
import { isSealed, open, seal } from "./secretBox";
import { type Codec, withTokenCrypto } from "./tokenClient";

const KEY_A = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const KEY_B = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

describe("secretBox", () => {
  it("round-trips a token and never stores it readable", async () => {
    const sealed = await seal("act-secret-123", KEY_A);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("act-secret-123");
    expect(await open(sealed, KEY_A)).toBe("act-secret-123");
  });

  it("uses a fresh random nonce each time", async () => {
    expect(await seal("same", KEY_A)).not.toBe(await seal("same", KEY_A));
  });

  it("does nothing without a key, and reads plain text as it always was", async () => {
    expect(await seal("plain", undefined)).toBe("plain");
    expect(await open("plain", undefined)).toBe("plain");
    expect(await open("plain", KEY_A)).toBe("plain");
  });

  it("does not seal twice", async () => {
    const once = await seal("x", KEY_A);
    expect(await seal(once, KEY_A)).toBe(once);
  });

  it("refuses a sealed token with the wrong key, or with no key, or if tampered with", async () => {
    const sealed = await seal("secret", KEY_A);
    await expect(open(sealed, KEY_B)).rejects.toThrow();
    await expect(open(sealed, undefined)).rejects.toThrow(/not set/);
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(open(tampered, KEY_A)).rejects.toThrow();
  });

  it("rotates: seals with the first key, opens with any", async () => {
    const old = await seal("secret", KEY_A);
    expect(await open(old, `${KEY_B},${KEY_A}`)).toBe("secret");
    const fresh = await seal("secret", `${KEY_B},${KEY_A}`);
    expect(await open(fresh, KEY_B)).toBe("secret");
  });

  it("rejects a key of the wrong size", async () => {
    await expect(seal("x", btoa("too short"))).rejects.toThrow(/32-byte/);
  });
});

// A stand-in for the Supabase client: records what it was asked and answers from `store`.
function fakeClient(store: Record<string, Record<string, unknown>[]>) {
  const writes: { table: string; method: string; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      const state = { table, method: "select", payload: undefined as unknown };
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit", "order"]) builder[m] = (..._a: unknown[]) => builder;
      for (const m of ["insert", "update", "upsert"])
        builder[m] = (payload: unknown) => {
          state.method = m;
          state.payload = payload;
          writes.push({ table, method: m, payload });
          return builder;
        };
      builder.maybeSingle = () => builder;
      builder.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: state.method === "select" ? store[table] : null, error: null }).then(ok);
      return builder;
    },
    rpc: () => "rpc-passthrough",
  };
  return { client, writes };
}

const codec: Codec = { seal: async (v) => `SEALED(${v})`, open: async (v) => v.replace(/^SEALED\((.*)\)$/, "$1") };

describe("withTokenCrypto", () => {
  it("seals tokens written to the token tables, and nothing else in the row", async () => {
    const { client, writes } = fakeClient({});
    const db = withTokenCrypto(client, codec);
    await db
      .from("tiktok_accounts")
      .update({ access_token: "a1", refresh_token: "r1", advertiser_id: "123" })
      .eq("id", 1);
    await db.from("bc_connections").upsert([{ agency_id: "x", access_token: "a2" }], { onConflict: "agency_id" });
    expect(writes[0].payload).toEqual({
      access_token: "SEALED(a1)",
      refresh_token: "SEALED(r1)",
      advertiser_id: "123",
    });
    expect(writes[1].payload).toEqual([{ agency_id: "x", access_token: "SEALED(a2)" }]);
  });

  it("opens tokens read back, for lists and single rows, and leaves plain ones alone", async () => {
    const { client } = fakeClient({
      tiktok_accounts: [
        { id: 1, access_token: "SEALED(a1)" },
        { id: 2, access_token: "legacy-plain" },
      ],
    });
    const db = withTokenCrypto(client, codec);
    const { data } = await db.from("tiktok_accounts").select("id, access_token").limit(5);
    expect(data).toEqual([
      { id: 1, access_token: "a1" },
      { id: 2, access_token: "legacy-plain" },
    ]);
  });

  it("does not touch other tables or other client features", async () => {
    const { client, writes } = fakeClient({ leads: [{ id: 1, access_token: "SEALED(untouched)" }] });
    const db = withTokenCrypto(client, codec);
    await db.from("leads").insert({ access_token: "keep" });
    const { data } = await db.from("leads").select("*");
    expect(writes[0].payload).toEqual({ access_token: "keep" });
    expect(data).toEqual([{ id: 1, access_token: "SEALED(untouched)" }]);
    expect((db as unknown as { rpc: () => string }).rpc()).toBe("rpc-passthrough");
  });

  it("works with the real codec end to end", async () => {
    const real: Codec = { seal: (v) => seal(v, KEY_A), open: (v) => open(v, KEY_A) };
    const written: unknown[] = [];
    const client = {
      from() {
        const b: Record<string, unknown> = {};
        b.insert = (p: unknown) => (written.push(p), b);
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: written.slice(), error: null }).then(ok);
        return b;
      },
    };
    const db = withTokenCrypto(client, real);
    const res = await db.from("tiktok_accounts").insert({ access_token: "live-token" });
    expect(isSealed((written[0] as { access_token: string }).access_token)).toBe(true);
    expect((res.data as { access_token: string }[])[0].access_token).toBe("live-token");
  });
});
