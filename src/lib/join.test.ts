import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearJoinToken, getJoinToken, setJoinToken, shouldRedirect, whatsappLink } from "./join";

describe("join token", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    });
  });
  it("survives broken storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("x");
      },
    });
    expect(getJoinToken()).toBeNull();
  });
  it("stores and clears", () => {
    expect(getJoinToken()).toBeNull();
    setJoinToken("abc");
    expect(getJoinToken()).toBe("abc");
    clearJoinToken();
    expect(getJoinToken()).toBeNull();
  });
});

describe("shouldRedirect", () => {
  it("only when signed in with a token, off /join and /auth", () => {
    expect(shouldRedirect("/", true, true)).toBe(true);
    expect(shouldRedirect("/onboarding", true, true)).toBe(true);
    expect(shouldRedirect("/join", true, true)).toBe(false);
    expect(shouldRedirect("/auth", true, true)).toBe(false);
    expect(shouldRedirect("/", false, true)).toBe(false);
    expect(shouldRedirect("/", true, false)).toBe(false);
  });
  it("encodes the whatsapp text", () => {
    expect(whatsappLink("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});
