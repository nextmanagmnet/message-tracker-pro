import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, MessageCircle, Search } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { getDefaultDateRange, type DateRange } from "@/components/dashboard/dateRange";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { invokeFn, maskHash, stageOf } from "@/components/leads/shared";
import { ChatRow } from "@/components/inbox/ChatRow";
import { StatsStrip } from "@/components/inbox/StatsStrip";
import { LIST_CAP, useInbox } from "@/components/inbox/useInbox";
import { useAgency } from "@/hooks/useAgency";
import { useAuth } from "@/hooks/useAuth";
import { filterChats, replyStats, sortChats, type InboxSort, type InboxTab } from "@/lib/replyTime";

const STAGES = ["new", "real", "qualified", "client", "not_lead"] as const;

const Inbox = () => {
  const { t } = useTranslation(["inbox", "features"]);
  const { selectedClient } = useAgency();
  const { user } = useAuth();
  const me = user?.id ?? null;
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const { chats, started, members, loading, failed, reload } = useInbox(selectedClient?.id, range);
  const [tab, setTab] = useState<InboxTab>("all");
  const [stage, setStage] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState<InboxSort>("recent");
  const [query, setQuery] = useState("");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Waiting times are measured against the last refresh.
  useEffect(() => setNow(Date.now()), [chats]);

  useEffect(() => {
    if (failed) toast.error(t("loadFailed"));
  }, [failed, t]);

  const nameOf = (id: string | null) => members.find((m) => m.userId === id)?.name ?? "";
  const visible = sortChats(
    filterChats(
      chats,
      { tab, me, stage, query, platform },
      (c) => stageOf(c.lead),
      (c) => `${maskHash(c.lead.sender_phone_hash)} ${c.preview} ${nameOf(c.assigned_to)}`,
      (c) => c.lead.ad_platform,
    ),
    sort,
    now,
  );
  const stats = useMemo(() => replyStats(started, now), [started, now]);
  const counts = {
    all: chats.length,
    mine: chats.filter((c) => me && c.assigned_to === me).length,
    unassigned: chats.filter((c) => !c.assigned_to).length,
  };

  const assign = async (conversationId: string, userId: string | null) => {
    setBusyId(conversationId);
    try {
      await invokeFn("inbox-actions", { action: "assign", conversationId, userId });
      toast.success(userId ? t("assigned") : t("unassignedDone"));
      await reload(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("assignFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const openLead = chats.find((c) => c.lead.id === openLeadId)?.lead ?? null;

  return (
    <DashboardLayout title={t("title")} subtitle={t("subtitle")}>
      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("selectClient")}</div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <DateRangePicker value={range} onChange={setRange} />
            <span className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span className="pulse-dot" /> {t("autoRefresh")}
            </span>
          </div>

          <StatsStrip stats={stats} members={members} />

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <Tabs value={tab} onValueChange={(v) => setTab(v as InboxTab)}>
              <TabsList>
                {(["mine", "unassigned", "all"] as const).map((k) => (
                  <TabsTrigger key={k} value={k}>
                    {t(`tabs.${k}`)} ({counts[k]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative flex-1 lg:max-w-xs">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="ps-9"
              />
            </div>
            <div className="flex gap-3">
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-[160px] bg-secondary border-border" aria-label={t("stageFilter")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allStages")}</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`features:stage.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger
                  className="w-[150px] bg-secondary border-border"
                  aria-label={t("features:leads.filter.allSources")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("features:leads.filter.allSources")}</SelectItem>
                  {(["tiktok", "meta", "none"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`features:platform.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as InboxSort)}>
                <SelectTrigger className="w-[170px] bg-secondary border-border" aria-label={t("sortLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">{t("sort.recent")}</SelectItem>
                  <SelectItem value="waiting">{t("sort.waiting")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t("loading")} />
            </div>
          ) : visible.length === 0 ? (
            <div className="glass-card wob-mesh-card p-12 text-center">
              <MessageCircle className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden />
              <p className="font-medium text-foreground">{t("empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
            </div>
          ) : (
            <ul className="space-y-3 sm:space-y-0 sm:divide-y sm:divide-border sm:overflow-hidden sm:rounded-xl sm:border sm:border-border sm:bg-card">
              {visible.map((c) => (
                <ChatRow
                  key={c.id}
                  chat={c}
                  members={members}
                  me={me}
                  now={now}
                  busy={busyId === c.id}
                  onOpen={() => setOpenLeadId(c.lead.id)}
                  onAssign={(userId) => assign(c.id, userId)}
                />
              ))}
            </ul>
          )}
          {chats.length >= LIST_CAP && <p className="mt-3 text-xs text-muted-foreground">{t("capped")}</p>}
        </>
      )}

      <LeadDrawer lead={openLead} onClose={() => setOpenLeadId(null)} onChanged={() => reload(true)} />
    </DashboardLayout>
  );
};

export default Inbox;
