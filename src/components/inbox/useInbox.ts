import { useCallback, useEffect, useState } from "react";
import type { DateRange } from "@/components/dashboard/dateRange";
import { db, invokeFn, type Lead, LEAD_COLUMNS } from "@/components/leads/shared";
import type { ChatTimes } from "@/lib/replyTime";

export type AgentStatus = "off" | "ai_active" | "handed_off" | "opted_out";

export type InboxChat = ChatTimes & {
  id: string;
  agent_status: AgentStatus;
  lead: Lead;
  preview: string;
};

export type Member = { userId: string; name: string; email: string | null };

type Raw = ChatTimes & {
  id: string;
  agent_status: AgentStatus;
  leads: Lead;
  messages: { text: string | null }[];
};

const LIST_COLUMNS = `id, agent_status, assigned_to, created_at, first_reply_at, last_inbound_at, last_outbound_at, last_message_at, leads!inner(${LEAD_COLUMNS}), messages(text)`;
export const LIST_CAP = 500;

/** Chats active in the range (with lead + last message), chats started in the range (for stats), and the team. */
export function useInbox(clientId: string | undefined, range: DateRange) {
  const [chats, setChats] = useState<InboxChat[]>([]);
  const [started, setStarted] = useState<ChatTimes[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!clientId) {
        setChats([]);
        setStarted([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const from = range.from.toISOString();
      const to = range.to.toISOString();
      const [list, stats] = await Promise.all([
        db
          .from("conversations")
          .select(LIST_COLUMNS)
          .eq("client_id", clientId)
          .gte("last_message_at", from)
          .lte("last_message_at", to)
          .order("last_message_at", { ascending: false })
          .order("created_at", { referencedTable: "messages", ascending: false })
          .limit(1, { referencedTable: "messages" })
          .limit(LIST_CAP),
        db
          .from("conversations")
          .select("assigned_to, created_at, first_reply_at, last_inbound_at, last_outbound_at, last_message_at")
          .eq("client_id", clientId)
          .gte("created_at", from)
          .lte("created_at", to)
          .limit(5000),
      ]);
      setFailed(Boolean(list.error || stats.error));
      if (!list.error) {
        const rows = (list.data ?? []) as unknown as Raw[];
        setChats(
          rows.map(({ leads, messages, ...c }) => ({
            ...c,
            lead: leads,
            preview: messages[0]?.text ?? leads.first_message,
          })),
        );
      }
      if (!stats.error) setStarted(stats.data ?? []);
      setLoading(false);
    },
    [clientId, range],
  );

  useEffect(() => {
    load();
    // Quiet refresh so new messages and assignments by teammates show up.
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    setMembers([]);
    if (!clientId) return;
    let live = true;
    invokeFn<{ members: Member[] }>("inbox-actions", { action: "team", clientId })
      .then((r) => live && setMembers(r.members))
      .catch((e) => console.error("inbox team load failed", e));
    return () => {
      live = false;
    };
  }, [clientId]);

  return { chats, started, members, loading, failed, reload: load };
}
