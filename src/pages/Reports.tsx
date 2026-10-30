import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";
import { downloadCsv } from "@/lib/metrics";
import { ratio, useFunnel } from "@/components/campaigns/useFunnel";
import { useFormat } from "@/components/leads/shared";
import { Download, Printer, Loader2 } from "lucide-react";

const Reports = () => {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { agency, selectedClient } = useAgency();
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const { leads, rows, totals, loading } = useFunnel(selectedClient?.id, range);

  const attributed = leads.filter((l) => l.ad_platform).length;
  const avgScore = leads.length ? Math.round(leads.reduce((s, l) => s + (l.quality_score ?? 0), 0) / leads.length) : 0;
  const period = `${range.from.toLocaleDateString()} – ${range.to.toLocaleDateString()}`;
  const cpq = ratio(totals.spend, totals.qualified);
  const cpc = ratio(totals.spend, totals.clients);
  const usd = (v: number | null) => (v === null ? "—" : f.money(v, "USD"));

  const exportCsv = () => {
    if (!selectedClient) return;
    const c = (k: string) => t(`reports.csv.${k}`);
    downloadCsv(`${selectedClient.name.replace(/\W+/g, "-")}-report.csv`, [
      [c("client"), selectedClient.name],
      [c("period"), period],
      [],
      [c("spend"), totals.spend.toFixed(2)],
      [c("clicks"), totals.clicks],
      [c("messages"), totals.leads],
      [c("real"), totals.real],
      [c("qualified"), totals.qualified],
      [c("clients"), totals.clients],
      [c("trash"), totals.trash],
      [c("revenue"), totals.revenue.toFixed(2)],
      [c("costPerQualified"), cpq?.toFixed(2) ?? ""],
      [c("costPerClient"), cpc?.toFixed(2) ?? ""],
      [c("attributed"), attributed],
      [c("avgScore"), avgScore],
      [c("conversionsSent"), totals.conversionsSent],
      [],
      [c("platform"), c("campaign"), c("spend"), c("clicks"), c("real"), c("qualified"), c("clients"), c("revenue")],
      ...rows.map((r) => [r.platform, r.name, r.spend.toFixed(2), r.clicks, r.real, r.qualified, r.clients, r.revenue.toFixed(2)]),
    ]);
  };

  const Stat = ({ label, value }: { label: string; value: string | number }) => (
    <div className="p-4 rounded-lg bg-secondary/50 print:border print:border-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );

  return (
    <DashboardLayout title={t("reports.title")} subtitle={t("reports.subtitle")}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!selectedClient}>
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button onClick={() => window.print()} disabled={!selectedClient}>
            <Printer className="w-4 h-4" /> {t("reports.pdf")}
          </Button>
        </div>
      </div>

      {!selectedClient ? (
        <p className="text-muted-foreground">{t("common.selectClient")}</p>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="glass-card p-8 space-y-8" id="report">
          <div>
            <p className="text-sm text-muted-foreground">{agency?.name}</p>
            <h2 className="text-2xl font-bold text-foreground">{t("reports.heading", { client: selectedClient.name })}</h2>
            <p className="text-sm text-muted-foreground">{period}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label={t("reports.csv.spend")} value={f.money(totals.spend, "USD")} />
            <Stat label={t("reports.csv.clicks")} value={f.num(totals.clicks)} />
            <Stat label={t("reports.csv.real")} value={f.num(totals.real)} />
            <Stat label={t("reports.csv.qualified")} value={f.num(totals.qualified)} />
            <Stat label={t("reports.csv.clients")} value={f.num(totals.clients)} />
            <Stat label={t("reports.csv.revenue")} value={f.money(totals.revenue, totals.currency)} />
            <Stat label={t("reports.csv.costPerQualified")} value={usd(cpq)} />
            <Stat label={t("reports.csv.costPerClient")} value={usd(cpc)} />
            <Stat label={t("reports.csv.messages")} value={f.num(totals.leads)} />
            <Stat label={t("reports.csv.trash")} value={f.num(totals.trash)} />
            <Stat label={t("reports.csv.attributed")} value={f.num(attributed)} />
            <Stat label={t("reports.csv.conversionsSent")} value={f.num(totals.conversionsSent)} />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3">{t("reports.campaigns")}</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("campaigns.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="text-start py-2">{t("reports.csv.campaign")}</th>
                      {["spend", "real", "qualified", "clients", "costPerClient"].map((k) => (
                        <th key={k} className="text-end py-2 ps-3">{t(`reports.csv.${k}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-border/50 text-foreground">
                        <td className="py-2">{t(`platform.${r.platform}`)} · {r.name}</td>
                        <td className="text-end">{f.money(r.spend, "USD")}</td>
                        <td className="text-end">{f.num(r.real)}</td>
                        <td className="text-end">{f.num(r.qualified)}</td>
                        <td className="text-end">{f.num(r.clients)}</td>
                        <td className="text-end">{usd(ratio(r.spend, r.clients))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Reports;
