import { describe, expect, it } from "vitest";
import { parseEvolutionItem, parseGreenMessage, parseMetaMessage } from "./parse";

describe("whatsapp webhook payload parsing", () => {
  it("reads a Meta text message with its ad referral", () => {
    const m = parseMetaMessage({
      type: "text", from: "15550001", id: "wamid.1", timestamp: "1700000000", text: { body: "hi" },
      referral: { ctwa_clid: "CLID", source_type: "ad", source_id: "AD1", click_timestamp: "1699999990" },
    });
    expect(m).toMatchObject({ jid: "15550001", text: "hi", externalId: "wamid.1", fromMe: false });
    expect(m.ts.getTime()).toBe(1700000000000);
    expect(m.referral).toEqual({ ctwaClid: "CLID", adId: "AD1", sourceType: "ad", headline: null, clickTs: 1699999990 });
    expect(parseMetaMessage({ type: "image" }).text).toBe("[image]");
  });

  it("prefers the real phone JID from Evolution and skips groups", () => {
    const m = parseEvolutionItem({
      key: { remoteJid: "abc@lid", senderPn: "15550002@s.whatsapp.net", id: "E1", fromMe: true },
      message: { extendedTextMessage: { text: "hello" } },
    });
    expect(m).toMatchObject({ jid: "15550002@s.whatsapp.net", text: "hello", externalId: "E1", fromMe: true, referral: null });
    expect(parseEvolutionItem({ key: { remoteJid: "123@g.us" } })).toBeNull();
    expect(parseEvolutionItem(undefined)).toBeNull();
  });

  it("only takes Green-API chat messages", () => {
    const m = parseGreenMessage({
      typeWebhook: "outgoingMessageReceived", senderData: { chatId: "15550003@c.us" },
      messageData: { typeMessage: "imageMessage" }, idMessage: "G1",
    });
    expect(m).toMatchObject({ jid: "15550003@c.us", text: "[imageMessage]", externalId: "G1", fromMe: true });
    expect(parseGreenMessage({ typeWebhook: "incomingMessageReceived", senderData: { chatId: "1@g.us" } })).toBeNull();
    expect(parseGreenMessage({ typeWebhook: "stateInstanceChanged" })).toBeNull();
  });
});
