// Pure reply-time and inbox list logic for the team inbox.

export const SLOW_REPLY_MS = 15 * 60_000;

export type ChatTimes = {
  assigned_to: string | null;
  created_at: string;
  first_reply_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
};

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/** How long the customer has been waiting: time since their last message, if nobody answered it yet. */
export function waitingMs(c: Pick<ChatTimes, "last_inbound_at" | "last_outbound_at">, now: number): number | null {
  const inbound = ms(c.last_inbound_at);
  const outbound = ms(c.last_outbound_at);
  if (inbound === null || (outbound !== null && outbound >= inbound)) return null;
  return Math.max(0, now - inbound);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type ReplyStats = {
  medianFirstReplyMs: number | null;
  /** Share (0–1) of chats answered within 15 min; null when none can be judged yet. */
  within15: number | null;
  perMember: Record<string, number>;
  unassigned: number;
};

/** Stats over chats started in the picked range. */
export function replyStats(chats: ChatTimes[], now: number): ReplyStats {
  const firstReplies: number[] = [];
  let judged = 0;
  let fast = 0;
  const perMember: Record<string, number> = {};
  let unassigned = 0;
  for (const c of chats) {
    if (c.assigned_to) perMember[c.assigned_to] = (perMember[c.assigned_to] ?? 0) + 1;
    else unassigned++;
    const start = new Date(c.created_at).getTime();
    const reply = ms(c.first_reply_at);
    if (reply !== null) {
      const took = Math.max(0, reply - start);
      firstReplies.push(took);
      judged++;
      if (took <= SLOW_REPLY_MS) fast++;
    } else if (c.last_outbound_at === null && now - start > SLOW_REPLY_MS) {
      judged++; // unanswered and already late
    }
    // ponytail: chats answered before first_reply_at existed have no first-reply time; skipped, not counted as slow.
  }
  return {
    medianFirstReplyMs: median(firstReplies),
    within15: judged ? fast / judged : null,
    perMember,
    unassigned,
  };
}

export type InboxTab = "mine" | "unassigned" | "all";
export type InboxSort = "recent" | "waiting";

export function filterChats<T extends Pick<ChatTimes, "assigned_to">>(
  rows: T[],
  opts: { tab: InboxTab; me: string | null; stage: string; query: string },
  stageOf: (r: T) => string,
  textOf: (r: T) => string,
): T[] {
  const q = opts.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.tab === "mine" && (!opts.me || r.assigned_to !== opts.me)) return false;
    if (opts.tab === "unassigned" && r.assigned_to) return false;
    if (opts.stage !== "all" && stageOf(r) !== opts.stage) return false;
    return !q || textOf(r).toLowerCase().includes(q);
  });
}

/** "recent": last message first. "waiting": longest-waiting first, answered chats after. */
export function sortChats<T extends ChatTimes>(rows: T[], sort: InboxSort, now: number): T[] {
  const last = (r: T) => ms(r.last_message_at) ?? 0;
  return [...rows].sort((a, b) => {
    if (sort === "waiting") {
      const d = (waitingMs(b, now) ?? -1) - (waitingMs(a, now) ?? -1);
      if (d) return d;
    }
    return last(b) - last(a);
  });
}
