import { describe, expect, it } from "vitest";
import { cleanMessage } from "./messageText";

describe("cleanMessage", () => {
  it("removes the hidden click reference", () => {
    expect(cleanMessage("Hello‍​‌‍")).toBe("Hello");
  });

  it("removes readable tracking codes but keeps the customer's words", () => {
    expect(cleanMessage("مرحبا ttclid=E.C.P.AbC123xyz cid=1234567890")).toBe("مرحبا");
    expect(cleanMessage("I want the blue one fbclid: IwAR0abc_def-1 please")).toBe("I want the blue one please");
    expect(cleanMessage("Hi cid=__CAMPAIGN_ID__")).toBe("Hi");
  });

  it("leaves ordinary text alone", () => {
    expect(cleanMessage("My cid card is ready")).toBe("My cid card is ready");
    expect(cleanMessage(null)).toBe("");
  });
});
