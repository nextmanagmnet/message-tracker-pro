import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { computeStats, downloadCsv, LeadLite } from "@/lib/metrics";
import { Download, Printer, Loader2 } from "lucide-react";

type Campaign = { campaign_name: string; spend: number | null; real_conversations: number | null; trash_conversations: number | null };
type Lead = LeadLite & { created_at: string; quality_score: number; attribution_source: string; referral_headline: string | null };

const Reports = () => {
  const { agency, selectedClient } = useAgency();
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedClient) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      supabase
        .from("leads")
        .select("status, created_at, quality_score, attribution_source, referral_headline")
        .eq("client_id", selectedClient.id)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("tiktok_campaigns")
        .select("campaign_name, spend, real_conversations, trash_conversations")
        .eq("client_id", selectedClient.id)
        .order("spend", { ascending: false }),
    ]).then(([l, c]) => {
      setLeads((l.data ?? []) as Lead[]);
      setCampaigns((c.data ?? []) as Campaign[]);
      setLoading(false);
    });
  }, [selectedClient?.id, range]);

  const spend = campaigns.reduce((s, c) => s + (Number(c.spend) || 0), 0);
  const stats = useMemo(() => computeStats(leads, spend), [leads, spend]);
  const attributed = leads.filter((l) => l.attribution_source === "referral").length;
  const avgScore = leads.length ? Math.round(leads.reduce((s, l) => s + l.quality_score, 0) / leads.length) : 0;
  const period = `${range.from.toLocaleDateString()} – ${range.to.toLocaleDateString()}`;

  const exportCsv = () => {
    if (!selectedClient) return;
    downloadCsv(`${selectedClient.name.replace(/\W+/g, "-")}-report.csv`, [
      ["Client", selectedClient.name],
      ["Period", period],
      [],
      ["Spend", spend.toFixed(2)],
      ["Real conversations", stats.real],
      ["Pending", stats.pending],
      ["Trash", stats.trash],
      ["Cost per real conversation", stats.costPerReal?.toFixed(2) ?? ""],
      ["Trash ratio %", stats.trashRatio.toFixed(1)],
      ["Attributed to ad click", attributed],
      ["Average quality score", avgScore],
      [],
      ["Campaign", "Spend", "Real", "Trash", "Cost per real"],
      ...campaigns.map((c) => {
        const r = c.real_conversations ?? 0;
        const s = Number(c.spend) || 0;
        return [c.campaign_name, s.toFixed(2), r, c.trash_conversations ?? 0, r ? (s / r).toFixed(2) : ""];
      }),
    ]);
  };

  const Stat = ({ label, value }: { label: string; value: string | number }) => (
    <div className="p-4 rounded-lg bg-secondary/50 print:border print:border-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );

  return (
    <DashboardLayout title="Client Report" subtitle="A shareable performance summary for the selected client">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!selectedClient}>
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button onClick={() => window.print()} disabled={!selectedClient}>
            <Printer className="w-4 h-4" /> Save as PDF
          </Button>
        </div>
      </div>

      {!selectedClient ? (
        <p className="text-muted-foreground">Select a client to build a report.</p>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="glass-card p-8 space-y-8" id="report">
          <div>
            <p className="text-sm text-muted-foreground">{agency?.name}</p>
            <h2 className="text-2xl font-bold text-foreground">{selectedClient.name} — Performance Report</h2>
            <p className="text-sm text-muted-foreground">{period}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Ad spend" value={`$${spend.toFixed(2)}`} />
            <Stat label="Real conversations" value={stats.real} />
            <Stat label="Cost per real" value={stats.costPerReal !== null ? `$${stats.costPerReal.toFixed(2)}` : "—"} />
            <Stat label="Trash ratio" value={`${stats.trashRatio.toFixed(1)}%`} />
            <Stat label="All messages" value={stats.total} />
            <Stat label="Pending review" value={stats.pending} />
            <Stat label="From ad clicks" value={attributed} />
            <Stat label="Avg quality score" value={avgScore} />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3">Campaigns</h3>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No TikTok campaigns synced yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Campaign</th>
                    <th className="text-right py-2">Spend</th>
                    <th className="text-right py-2">Real</th>
                    <th className="text-right py-2">Trash</th>
                    <th className="text-right py-2">Cost / real</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => {
                    const r = c.real_conversations ?? 0;
                    const s = Number(c.spend) || 0;
                    return (
                      <tr key={i} className="border-b border-border/50 text-foreground">
                        <td className="py-2">{c.campaign_name}</td>
                        <td className="text-right">${s.toFixed(2)}</td>
                        <td className="text-right">{r}</td>
                        <td className="text-right">{c.trash_conversations ?? 0}</td>
                        <td className="text-right">{r ? `$${(s / r).toFixed(2)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Reports;
