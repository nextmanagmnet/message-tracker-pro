import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "@/components/leads/shared";
import type { ReplyStats } from "@/lib/replyTime";
import type { Member } from "./useInbox";
import { useDuration } from "./useDuration";

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-xl font-semibold text-foreground">{children}</div>
    </div>
  );
}

export function StatsStrip({ stats, members }: { stats: ReplyStats; members: Member[] }) {
  const { t } = useTranslation("inbox");
  const f = useFormat();
  const duration = useDuration();
  const perMember = Object.entries(stats.perMember).sort((a, b) => b[1] - a[1]);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? t("teammate");

  return (
    <section aria-label={t("stats.label")} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={t("stats.median")}>
        {stats.medianFirstReplyMs === null ? "—" : duration(stats.medianFirstReplyMs)}
      </Tile>
      <Tile label={t("stats.within15")}>{stats.within15 === null ? "—" : f.pct(stats.within15)}</Tile>
      <Tile label={t("stats.perMember")}>
        {perMember.length === 0 ? (
          "—"
        ) : (
          <ul className="space-y-0.5 text-sm font-normal">
            {perMember.slice(0, 4).map(([id, n]) => (
              <li key={id} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{nameOf(id)}</span>
                <span className="font-semibold">{f.num(n)}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>
      <Tile label={t("stats.unassigned")}>{f.num(stats.unassigned)}</Tile>
    </section>
  );
}
