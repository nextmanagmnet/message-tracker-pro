import { describe, expect, it } from "vitest";
import {
  clampProfile,
  MAX_PROFILE_CHARS,
  profileFromJson,
  sampleOwnerMessages,
  scrubPersonalData,
  toneSection,
} from "./tone";

describe("scrubPersonalData", () => {
  it("removes phones, emails, links and long digit runs but keeps prices", () => {
    expect(scrubPersonalData("call +961 71 234 567 or mail a.b@shop.com")).toBe("call [number] or mail [email]");
    expect(scrubPersonalData("tracking 123456789 https://x.co/t")).toBe("tracking [number] [link]");
    expect(scrubPersonalData("60$ habibi")).toBe("60$ habibi");
  });
});

describe("sampleOwnerMessages", () => {
  it("skips media, acks, marker templates, duplicates and empty texts", () => {
    const out = sampleOwnerMessages(
      [
        "[audioMessage]",
        "ok",
        "👍",
        null,
        "ORDER CONFIRMED — total 60$",
        "Your order delivered ✅ ORDER DELIVERED",
        "Ya hala 😍",
        "Ya hala 😍",
        "?",
        "Kifak, l price 55$",
      ],
      ["ORDER CONFIRMED", "order delivered", null],
    );
    expect(out).toEqual(["Ya hala 😍", "Kifak, l price 55$"]);
  });

  it("caps the sample size", () => {
    const texts = Array.from({ length: 50 }, (_, i) => `message number ${i} hello`);
    expect(sampleOwnerMessages(texts, [], 10)).toHaveLength(10);
  });

  it("scrubs numbers inside kept messages", () => {
    expect(sampleOwnerMessages(["send to 70123456 please"], [])).toEqual(["send to [number] please"]);
  });
});

const good = {
  languages: "Lebanese Arabic in Latin letters with English",
  formality: "Casual and warm",
  greetings: '"Ya hala", "Hi"',
  sign_offs: "Rarely signs off",
  emoji: "Often 😍 and 🙏",
  sentence_length: "Very short, little punctuation",
  prices_and_questions: "States the price alone, e.g. 60$",
  examples: ["Ya hala 😍", "l price 60$", "Kifak? shu baddak?", "Merci habibi 🙏"],
};

describe("profileFromJson", () => {
  it("renders a valid profile as plain text", () => {
    const p = profileFromJson(JSON.stringify(good))!;
    expect(p).toContain("Languages: Lebanese Arabic");
    expect(p).toContain("- l price 60$");
    expect(p.length).toBeLessThanOrEqual(MAX_PROFILE_CHARS);
  });

  it("scrubs personal data the model might echo", () => {
    const p = profileFromJson(JSON.stringify({ ...good, examples: [...good.examples, "call me 03 123 456"] }))!;
    expect(p).not.toMatch(/123 456/);
  });

  it("rejects invalid or thin output", () => {
    expect(profileFromJson(null)).toBeNull();
    expect(profileFromJson("not json")).toBeNull();
    expect(profileFromJson(JSON.stringify({ ...good, examples: ["hi"] }))).toBeNull();
    expect(profileFromJson(JSON.stringify({ examples: ["a b", "c d", "e f"] }))).toBeNull();
  });
});

describe("clampProfile / toneSection", () => {
  it("clamps long profiles at a line boundary", () => {
    const long = Array.from({ length: 100 }, (_, i) => `line ${i} ${"x".repeat(30)}`).join("\n");
    const c = clampProfile(long);
    expect(c.length).toBeLessThanOrEqual(MAX_PROFILE_CHARS);
    expect(c.endsWith("x")).toBe(true);
  });

  it("is empty without a profile and style-only with one", () => {
    expect(toneSection(null)).toBe("");
    expect(toneSection("   ")).toBe("");
    expect(toneSection("Emoji: lots")).toMatch(
      /Match this owner's writing style[\s\S]*rules above always win[\s\S]*Emoji: lots/,
    );
  });
});
