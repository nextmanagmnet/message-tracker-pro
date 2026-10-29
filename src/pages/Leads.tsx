import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { db, invokeFn, Lead, LEAD_COLUMNS, maskHash, stageOf, useFormat } from "@/components/leads/shared";
import { PlatformChip, StageBadge } from "@/components/leads/badges";

type StageFilter = "all" | "real" | "qualified" | "client" | "not_lead" | "new";
type PlatformFilter = "all" | "tiktok" | "meta" | "none";

const Leads = () => {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { selectedClient } = useAgency();
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClient) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await db.from("leads").select(LEAD_COLUMNS).eq("client_id", selectedClient.id)
      .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString())
      .order("created_at", { ascending: false }).limit(500);
    if (error) toast.error(t("leads.loadFailed"));
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }, [selectedClient, range, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedClient) return;
    const filter = `client_id=eq.${selectedClient.id}`;
    const channel = supabase
      .channel(`wob-leads-${selectedClient.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads", filter }, (p) => {
        setLeads((prev) => [p.new as Lead, ...prev].slice(0, 500));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads", filter }, (p) => {
        const updated = p.new as Lead;
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedClient]);

  const visible = useMemo(
    () =>
      leads.filter((l) => {
        if (stageFilter !== "all" && stageOf(l) !== stageFilter) return false;
        if (platformFilter === "none") return !l.ad_platform;
        return platformFilter === "all" || l.ad_platform === platformFilter;
      }),
    [leads, stageFilter, platformFilter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[stageOf(l)] = (c[stageOf(l)] ?? 0) + 1;
    return c;
  }, [leads]);

  const accept = async (lead: Lead) => {
    try {
      await invokeFn("lead-actions", { action: "accept_suggestion", leadId: lead.id });
      toast.success(t("leads.done.accept_suggestion"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const open = leads.find((l) => l.id === openId) ?? null;

  return (
    <DashboardLayout title={t("leads.title")} subtitle={t("leads.subtitle")}>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={range} onChange={setRange} />
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
          <SelectTrigger className="w-[170px] bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("leads.filter.allStages")}</SelectItem>
            {(["real", "qualified", "client", "new", "not_lead"] as const).map((s) => (
              <SelectItem key={s} value={s}>{t(`stage.${s}`)} ({counts[s] ?? 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}>
          <SelectTrigger className="w-[150px] bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("leads.filter.allSources")}</SelectItem>
            <SelectItem value="tiktok">{t("platform.tiktok")}</SelectItem>
            <SelectItem value="meta">{t("platform.meta")}</SelectItem>
            <SelectItem value="none">{t("platform.none")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="pulse-dot" /> {t("leads.live")}
        </span>
      </div>

      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("common.selectClient")}</div>
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <div className="glass-card wob-mesh-card p-12 text-center">
          <MessageCircle className="mx-auto mb-3 w-8 h-8 text-primary" />
          <p className="text-foreground font-medium">{t("leads.empty")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("leads.emptyHint")}</p>
        </div>
      ) : (
        <div className="glass-card divide-y divide-border overflow-hidden">
          {visible.map((l) => {
            const stage = stageOf(l);
            const suggest = l.stage_suggestion && l.stage_suggestion !== stage ? l.stage_suggestion : null;
            return (
              <div
                key={l.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(l.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenId(l.id)}
                className="flex flex-col gap-2 p-4 hover:bg-secondary/50 transition-colors cursor-pointer sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground" dir="ltr">{maskHash(l.sender_phone_hash)}</span>
                    <StageBadge stage={stage} />
                    <PlatformChip platform={l.ad_platform} />
                    {l.referral_headline && <span className="truncate text-xs text-primary">{l.referral_headline}</span>}
                    {stage === "client" && l.order_value ? (
                      <span className="text-xs font-semibold text-success">{f.money(l.order_value, l.order_currency ?? "SAR")}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{l.first_message}</p>
                </div>
                {suggest && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      accept(l);
                    }}
                    className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 sm:self-center"
                  >
                    <Sparkles className="w-3 h-3" />
                    {t("leads.suggestionChip", {
                      stage: t(`stage.${suggest}`),
                      value: suggest === "client" && l.order_value ? ` — ${f.money(l.order_value, l.order_currency ?? "SAR")}` : "",
                    })}
                    <span className="font-semibold">· {t("leads.accept")}</span>
                  </button>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{f.ago(l.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}

      {leads.length >= 500 && (
        <p className="mt-3 text-xs text-muted-foreground">{t("leads.capped")}</p>
      )}

      <LeadDrawer lead={open} onClose={() => setOpenId(null)} onChanged={load} />
      {selectedClient && !loading && leads.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={load}>{t("common.refresh")}</Button>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Leads;
