import { describe, expect, it } from "vitest";
import { type ChatTimes, filterChats, median, replyStats, sortChats, waitingMs } from "./replyTime";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();
const chat = (p: Partial<ChatTimes> & { id?: string }): ChatTimes & { id: string } => ({
  id: "c",
  assigned_to: null,
  created_at: at(60),
  first_reply_at: null,
  last_inbound_at: null,
  last_outbound_at: null,
  last_message_at: null,
  ...p,
});

describe("waitingMs", () => {
  it("counts from the last inbound message when it is unanswered", () => {
    expect(waitingMs(chat({ last_inbound_at: at(20), last_outbound_at: at(30) }), NOW)).toBe(20 * 60_000);
    expect(waitingMs(chat({ last_inbound_at: at(20) }), NOW)).toBe(20 * 60_000);
  });
  it("is null once replied or with no inbound", () => {
    expect(waitingMs(chat({ last_inbound_at: at(20), last_outbound_at: at(10) }), NOW)).toBeNull();
    expect(waitingMs(chat({}), NOW)).toBeNull();
  });
});

describe("median", () => {
  it("handles empty, odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("replyStats", () => {
  it("computes median, within-15 share, per member and unassigned", () => {
    const s = replyStats(
      [
        chat({ created_at: at(60), first_reply_at: at(55), last_outbound_at: at(55), assigned_to: "u1" }), // 5 min
        chat({ created_at: at(60), first_reply_at: at(30), last_outbound_at: at(30), assigned_to: "u1" }), // 30 min
        chat({ created_at: at(60), assigned_to: "u2" }), // unanswered for an hour: late
        chat({ created_at: at(5) }), // unanswered but still within 15 min: not judged
        chat({ created_at: at(60), last_outbound_at: at(50) }), // legacy, no first_reply_at: not judged
      ],
      NOW,
    );
    expect(s.medianFirstReplyMs).toBe(17.5 * 60_000);
    expect(s.within15).toBeCloseTo(1 / 3);
    expect(s.perMember).toEqual({ u1: 2, u2: 1 });
    expect(s.unassigned).toBe(2);
  });
  it("returns nulls with no data", () => {
    expect(replyStats([], NOW)).toEqual({ medianFirstReplyMs: null, within15: null, perMember: {}, unassigned: 0 });
  });
});

describe("filterChats / sortChats", () => {
  const rows = [
    chat({ id: "a", assigned_to: "me", last_message_at: at(10), last_inbound_at: at(10) }),
    chat({ id: "b", last_message_at: at(1), last_inbound_at: at(5), last_outbound_at: at(1) }),
    chat({ id: "c", assigned_to: "other", last_message_at: at(3), last_inbound_at: at(30) }),
  ];
  const stage = (r: { id: string }) => (r.id === "c" ? "client" : "new");
  const text = (r: { id: string }) => `chat ${r.id}`;
  const ids = (rs: { id: string }[]) => rs.map((r) => r.id);

  it("filters by tab, stage and search", () => {
    const base = { tab: "all" as const, me: "me", stage: "all", query: "" };
    expect(ids(filterChats(rows, { ...base, tab: "mine" }, stage, text))).toEqual(["a"]);
    expect(ids(filterChats(rows, { ...base, tab: "unassigned" }, stage, text))).toEqual(["b"]);
    expect(ids(filterChats(rows, { ...base, stage: "client" }, stage, text))).toEqual(["c"]);
    expect(ids(filterChats(rows, { ...base, query: " CHAT B " }, stage, text))).toEqual(["b"]);
    expect(filterChats(rows, { ...base, tab: "mine", me: null }, stage, text)).toEqual([]);
  });

  it("sorts by last message or by waiting time", () => {
    expect(ids(sortChats(rows, "recent", NOW))).toEqual(["b", "c", "a"]);
    expect(ids(sortChats(rows, "waiting", NOW))).toEqual(["c", "a", "b"]);
  });
});
