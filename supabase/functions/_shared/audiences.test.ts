import { describe, expect, it } from "vitest";
import { e164FromJid, isLookalikeSize, isSource, membersFile, needsReconnect, sha256Hex } from "./audiences.ts";

describe("e164FromJid", () => {
  it("turns a WhatsApp jid into +digits", () => {
    expect(e164FromJid("15550001111@s.whatsapp.net")).toBe("+15550001111");
    expect(e164FromJid("15550001111:12@s.whatsapp.net")).toBe("+15550001111"); // device suffix dropped
  });
  it("rejects things that are not phone numbers", () => {
    expect(e164FromJid(null)).toBeNull();
    expect(e164FromJid("123@s.whatsapp.net")).toBeNull();
    expect(e164FromJid("1234567890123456@s.whatsapp.net")).toBeNull();
  });
});

describe("membersFile", () => {
  it("hashes E.164 with the plus, lowercase hex, deduped and sorted", async () => {
    const expected = await sha256Hex("+15550001111");
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    const { csv, count } = await membersFile([
      "15550001111@s.whatsapp.net",
      "15550001111@s.whatsapp.net",
      "15550002222@s.whatsapp.net",
      null,
    ]);
    expect(count).toBe(2);
    const lines = csv.split("\n");
    expect(lines).toContain(expected);
    expect([...lines].sort()).toEqual(lines);
  });
  it("is empty without members", async () => {
    expect(await membersFile([])).toEqual({ csv: "", count: 0 });
  });
});

describe("guards", () => {
  it("validates sources and sizes", () => {
    expect(isSource("buyers")).toBe(true);
    expect(isSource("everyone")).toBe(false);
    expect(isLookalikeSize("BALANCED")).toBe(true);
    expect(isLookalikeSize("HUGE")).toBe(false);
  });
  it("spots token/scope problems", () => {
    expect(needsReconnect(40001, "No permission to operate")).toBe(true);
    expect(needsReconnect(40002, "Seed audience size needs to be at lease 1000")).toBe(false);
  });
});
