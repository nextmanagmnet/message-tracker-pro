import { describe, expect, it } from "vitest";
import { scoreLead, type ScoringInput } from "./scoring";

const baseInput: ScoringInput = {
  message: "",
  hasReferral: false,
  ctwaClid: null,
  clickToMessageSeconds: null,
  clientVelocity10m: 0,
  senderLeadCount: 0,
  senderDistinctSources: 0,
  duplicateMessageText: false,
};

describe("scoreLead", () => {
  it("rejects an emoji-only message as trash, even with perfect attribution", () => {
    const result = scoreLead({
      ...baseInput,
      message: "👍😊",
      hasReferral: true,
      ctwaClid: "clid123",
      clickToMessageSeconds: 30,
    });
    expect(result.isReal).toBe(false);
    expect(result.status).not.toBe("verified");
  });

  it("rejects a bare greeting as low-intent", () => {
    const result = scoreLead({ ...baseInput, message: "hello" });
    expect(result.isReal).toBe(false);
  });

  it("verifies a genuine, well-attributed, human-timed inquiry", () => {
    const result = scoreLead({
      ...baseInput,
      message: "Hi, how much is delivery to Jeddah and is it available in blue?",
      hasReferral: true,
      ctwaClid: "clid123",
      clickToMessageSeconds: 60,
    });
    expect(result.isReal).toBe(true);
    expect(result.status).toBe("verified");
  });

  it("penalizes a click-to-message gap under 2s as automation", () => {
    const withGap = scoreLead({
      ...baseInput,
      message: "What's the price and is it in stock?",
      hasReferral: true,
      ctwaClid: "clid123",
      clickToMessageSeconds: 60,
    });
    const tooFast = scoreLead({
      ...baseInput,
      message: "What's the price and is it in stock?",
      hasReferral: true,
      ctwaClid: "clid123",
      clickToMessageSeconds: 1,
    });
    expect(tooFast.score).toBeLessThan(withGap.score);
  });

  it("penalizes high per-client velocity (spam burst)", () => {
    const normal = scoreLead({
      ...baseInput,
      message: "I'd like to book an appointment please",
      clientVelocity10m: 1,
    });
    const burst = scoreLead({
      ...baseInput,
      message: "I'd like to book an appointment please",
      clientVelocity10m: 50,
    });
    expect(burst.score).toBeLessThan(normal.score);
  });

  it("penalizes a sender who already messaged through multiple distinct sources", () => {
    const first = scoreLead({
      ...baseInput,
      message: "I want to order the large size please",
      senderDistinctSources: 0,
    });
    const farmed = scoreLead({
      ...baseInput,
      message: "I want to order the large size please",
      senderDistinctSources: 5,
    });
    expect(farmed.score).toBeLessThan(first.score);
  });

  it("penalizes an exact-duplicate first message for the client", () => {
    const unique = scoreLead({
      ...baseInput,
      message: "Is this still available in size M?",
      duplicateMessageText: false,
    });
    const duplicate = scoreLead({
      ...baseInput,
      message: "Is this still available in size M?",
      duplicateMessageText: true,
    });
    expect(duplicate.score).toBeLessThan(unique.score);
  });

  it("always clamps the score to [0, 100]", () => {
    const worst = scoreLead({
      ...baseInput,
      message: "🙂",
      hasReferral: false,
      clickToMessageSeconds: 1,
      clientVelocity10m: 100,
      senderLeadCount: 20,
      senderDistinctSources: 10,
      duplicateMessageText: true,
    });
    const best = scoreLead({
      ...baseInput,
      message: "I need a price quote, availability, and delivery details please",
      hasReferral: true,
      ctwaClid: "clid123",
      clickToMessageSeconds: 60,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(best.score).toBeLessThanOrEqual(100);
  });

  it("marks very low scores as trash rather than merely pending", () => {
    const result = scoreLead({
      ...baseInput,
      message: "ok",
      clientVelocity10m: 50,
      senderLeadCount: 10,
      duplicateMessageText: true,
    });
    expect(result.status).toBe("trash");
  });

  it("keeps a plain greeting from a new phone as a pending lead, not trash", () => {
    expect(scoreLead({ ...baseInput, message: "Hello" }).status).toBe("pending");
  });
});
