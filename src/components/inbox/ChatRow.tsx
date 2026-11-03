import { useTranslation } from "react-i18next";
import { Bot, ChevronDown, Clock, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StageBadge } from "@/components/leads/badges";
import { maskHash, stageOf, useFormat } from "@/components/leads/shared";
import { SLOW_REPLY_MS, waitingMs } from "@/lib/replyTime";
import { cn } from "@/lib/utils";
import type { InboxChat, Member } from "./useInbox";
import { useDuration } from "./useDuration";

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export function ChatRow({
  chat,
  members,
  me,
  now,
  busy,
  onOpen,
  onAssign,
}: {
  chat: InboxChat;
  members: Member[];
  me: string | null;
  now: number;
  busy: boolean;
  onOpen: () => void;
  onAssign: (userId: string | null) => void;
}) {
  const { t } = useTranslation("inbox");
  const f = useFormat();
  const duration = useDuration();
  const waiting = waitingMs(chat, now);
  const late = waiting !== null && waiting > SLOW_REPLY_MS;
  const assignee = chat.assigned_to ? members.find((m) => m.userId === chat.assigned_to) : null;
  const assigneeName = chat.assigned_to ? (assignee?.name ?? t("teammate")) : null;
  const ai = chat.agent_status === "ai_active";

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:rounded-none sm:border-0 sm:bg-transparent">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground" dir="ltr">
            {maskHash(chat.lead.sender_phone_hash)}
          </span>
          <StageBadge stage={stageOf(chat.lead)} />
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              ai ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {ai ? <Bot className="h-3 w-3" aria-hidden /> : <UserRound className="h-3 w-3" aria-hidden />}
            {t(`agent.${chat.agent_status}`)}
          </span>
          {waiting !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                late ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
              )}
            >
              <Clock className="h-3 w-3" aria-hidden />
              {t("waiting", { time: duration(waiting) })}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground" dir="auto">
          {chat.preview || t("noText")}
        </p>
      </button>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            aria-label={assigneeName ? t("assignedTo", { name: assigneeName }) : t("assign")}
            className="inline-flex max-w-[12rem] items-center gap-2 rounded-full border border-border px-2 py-1 text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {assigneeName ? (
              <>
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[10px]">{initials(assigneeName)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{chat.assigned_to === me ? t("you") : assigneeName}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{t("unassigned")}</span>
            )}
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {me && chat.assigned_to !== me && (
              <DropdownMenuItem onSelect={() => onAssign(me)}>{t("assignToMe")}</DropdownMenuItem>
            )}
            {members.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("assignTo")}</DropdownMenuLabel>
                {members
                  .filter((m) => m.userId !== chat.assigned_to && m.userId !== me)
                  .map((m) => (
                    <DropdownMenuItem key={m.userId} onSelect={() => onAssign(m.userId)}>
                      {m.name}
                    </DropdownMenuItem>
                  ))}
              </>
            )}
            {chat.assigned_to && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onAssign(null)}>{t("unassign")}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {chat.last_message_at && (
          <span className="shrink-0 text-xs text-muted-foreground">{f.ago(chat.last_message_at)}</span>
        )}
      </div>
    </li>
  );
}
