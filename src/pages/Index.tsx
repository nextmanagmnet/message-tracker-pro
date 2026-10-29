import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ConversionChart, ChartPoint } from "@/components/dashboard/ConversionChart";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { AlertTriangle, BadgeCheck, ChevronRight, Coins, Loader2, Send, Target } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { ratio, useFunnel } from "@/components/campaigns/useFunnel";
import { atLeast, maskHash, stageOf, useFormat } from "@/components/leads/shared";
import { PlatformChip, StageBadge } from "@/components/leads/badges";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const Index = () => {
  const { t, i18n } = useTranslation("features");
  const f = useFormat();
  const navigate = useNavigate();
  const { selectedClient } = useAgency();
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const { leads, totals, loading } = useFunnel(selectedClient?.id, range);

  const chart = useMemo<ChartPoint[]>(() => {
    const map = new Map<string, ChartPoint>();
    const start = new Date(range.from);
    start.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= range.to; d.setDate(d.getDate() + 1)) {
      map.set(dayKey(d), {
        date: d.toLocaleDateString(i18n.language === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric" }),
        real: 0, qualified: 0, clients: 0, trash: 0,
      });
    }
    for (const l of leads) {
      const p = map.get(dayKey(new Date(l.created_at)));
      if (!p) continue;
      if (stageOf(l) === "not_lead") p.trash++;
      if (atLeast(l, "real")) p.real++;
      if (atLeast(l, "qualified")) p.qualified++;
      if (stageOf(l) === "client") p.clients++;
    }
    return [...map.values()];
  }, [leads, range, i18n.language]);

  const steps = [
    { key: "clicks", value: totals.clicks },
    { key: "real", value: totals.real },
    { key: "qualified", value: totals.qualified },
    { key: "clients", value: totals.clients },
  ];
  const trashRate = totals.leads ? totals.trash / totals.leads : 0;
  const money = (v: number | null) => (v === null ? "—" : f.money(v, "USD"));

  return (
    <DashboardLayout
      title={t("dashboard.title")}
      subtitle={selectedClient ? t("dashboard.subtitle", { client: selectedClient.name }) : t("common.selectClient")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <DateRangePicker value={range} onChange={setRange} />
        <Button variant="outline" onClick={() => navigate("/connections")}>{t("dashboard.manageConnections")}</Button>
      </div>

      {!selectedClient ? (
        <div className="glass-card wob-mesh-hero p-12 text-center">
          <p className="text-foreground mb-4">{t("dashboard.noClient")}</p>
          <Button onClick={() => navigate("/connections")}>{t("dashboard.getStarted")}</Button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <section className="glass-card wob-mesh-hero p-6 mb-6" aria-label={t("dashboard.funnel")}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80 mb-4">{t("dashboard.funnel")}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {steps.map((s, i) => {
                const prev = i > 0 ? steps[i - 1].value : 0;
                return (
                  <div key={s.key} className="relative rounded-xl bg-background/60 p-4 backdrop-blur">
                    <p className="text-xs text-muted-foreground">{t(`dashboard.step.${s.key}`)}</p>
                    <p className="font-display text-3xl font-bold text-foreground">{f.num(s.value)}</p>
                    {i > 0 && prev > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{t("dashboard.ofPrevious", { pct: f.pct(s.value / prev) })}</p>
                    )}
                    {i < steps.length - 1 && (
                      <ChevronRight className="absolute top-1/2 -end-3 hidden h-5 w-5 -translate-y-1/2 text-primary md:block rtl:rotate-180" />
                    )}
                  </div>
                );
              })}
            </div>
            {totals.clicks === 0 && <p className="mt-3 text-xs text-muted-foreground">{t("dashboard.noClicks")}</p>}
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard title={t("dashboard.costPerQualified")} value={money(ratio(totals.spend, totals.qualified))} icon={<Target className="w-5 h-5" />} />
            <MetricCard title={t("dashboard.costPerClient")} value={money(ratio(totals.spend, totals.clients))} icon={<BadgeCheck className="w-5 h-5" />} />
            <MetricCard title={t("dashboard.revenue")} value={f.money(totals.revenue, "SAR")} icon={<Coins className="w-5 h-5" />} />
            <MetricCard title={t("dashboard.trashRate")} value={f.pct(trashRate)} icon={<AlertTriangle className="w-5 h-5" />} />
            <MetricCard title={t("dashboard.conversionsSent")} value={f.num(totals.conversionsSent)} hint={t("dashboard.conversionsSentHint")} icon={<Send className="w-5 h-5" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><ConversionChart data={chart} /></div>
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">{t("dashboard.recentLeads")}</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("/leads")}>{t("common.viewAll")}</Button>
              </div>
              {leads.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("leads.empty")}</p>
              ) : (
                <ul className="space-y-2 max-h-[400px] overflow-y-auto">
                  {leads.slice(0, 8).map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => navigate("/leads")}
                        className="w-full rounded-xl bg-secondary/50 p-3 text-start hover:bg-secondary transition-colors"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground" dir="ltr">{maskHash(l.sender_phone_hash)}</span>
                          <StageBadge stage={stageOf(l)} />
                          <PlatformChip platform={l.ad_platform} />
                          <span className="ms-auto text-xs text-muted-foreground">{f.ago(l.created_at)}</span>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{l.first_message}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
};

export default Index;
