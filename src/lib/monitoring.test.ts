import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/react";
import { IGNORED_ERRORS, scrubEvent } from "./monitoring";

describe("scrubEvent", () => {
  it("drops bodies, cookies, headers, email and ip but keeps the user id", () => {
    const e = {
      type: undefined,
      request: { url: "/x", data: "secret", cookies: { a: "b" }, headers: { h: "v" } },
      user: { id: "u1", email: "a@b.c", ip_address: "1.2.3.4" },
    } as unknown as ErrorEvent;
    const out = scrubEvent(e);
    expect(out.request).toEqual({ url: "/x" });
    expect(out.user).toEqual({ id: "u1" });
  });
  it("removes a user without an id", () => {
    const e = { type: undefined, user: { email: "a@b.c" } } as unknown as ErrorEvent;
    expect(scrubEvent(e).user).toBeUndefined();
  });
  it("ignores ResizeObserver noise", () => {
    expect(IGNORED_ERRORS.some((r) => r.test("ResizeObserver loop limit exceeded"))).toBe(true);
  });
});
