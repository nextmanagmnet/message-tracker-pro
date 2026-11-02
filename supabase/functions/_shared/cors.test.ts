import { describe, expect, it } from "vitest";
import { allowOrigin, appOrigins } from "./cors";

describe("CORS origin allowlist", () => {
  const allowed = appOrigins(" https://wob-platform.vercel.app/ , https://app.wob.com,");
  it("parses APP_ORIGINS", () => {
    expect(allowed).toEqual(["https://wob-platform.vercel.app", "https://app.wob.com"]);
    expect(appOrigins(undefined)).toEqual([]);
  });
  it("echoes an allowed origin, else the first allowed one", () => {
    expect(allowOrigin("https://app.wob.com", allowed)).toBe("https://app.wob.com");
    expect(allowOrigin("https://evil.example", allowed)).toBe("https://wob-platform.vercel.app");
    expect(allowOrigin(null, allowed)).toBe("https://wob-platform.vercel.app");
  });
  it("stays open when APP_ORIGINS is unset", () => {
    expect(allowOrigin("https://anything.example", [])).toBe("*");
  });
});
