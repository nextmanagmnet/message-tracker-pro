import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DateRangePicker, DateRange, getDefaultDateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { computeStats, downloadCsv, LeadLite } from "@/lib/metrics";
import { Building2, MessageCircle, DollarSign, AlertTriangle, Download, Loader2, ArrowUpDown } from "lucide-react";

type SortKey = "name" | "spend" | "real" | "cost" | "trash";

const AgencyOverview = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { agency, clients, setSelectedClient } = useAgency();
  const [range, setRange] = useState<DateRange>(getDefaultDateRange());
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [spendByClient, setSpendByClient] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "spend", desc: true });

  useEffect(() => {
    if (!clients.length) {
      setLoading(false);
      return;
    }
    const ids = clients.map((c) => c.id);
    setLoading(true);
    Promise.all([
      supabase
        .from("leads")
        .select("status, client_id")
        .in("client_id", ids)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .limit(10000),
      supabase.from("tiktok_campaigns").select("client_id, spend").in("client_id", ids),
    ]).then(([l, c]) => {
      setLeads((l.data ?? []) as LeadLite[]);
      const m = new Map<string, number>();
      for (const row of c.data ?? []) {
        if (!row.client_id) continue;
        m.set(row.client_id, (m.get(row.client_id) ?? 0) + (Number(row.spend) || 0));
      }
      setSpendByClient(m);
      setLoading(false);
    });
  }, [clients, range]);

  const rows = useMemo(() => {
    const list = clients.map((c) => ({
      client: c,
      stats: computeStats(
        leads.filter((l) => l.client_id === c.id),
        spendByClient.get(c.id) ?? 0
      ),
    }));
    const val = (r: (typeof list)[number]) => {
      switch (sort.key) {
        case "name": return r.client.name.toLowerCase();
        case "spend": return r.stats.spend;
        case "real": return r.stats.real;
        case "cost": return r.stats.costPerReal ?? Number.POSITIVE_INFINITY;
        case "trash": return r.stats.trashRatio;
      }
    };
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -cmp : cmp;
    });
  }, [clients, leads, spendByClient, sort]);

  const totals = useMemo(() => {
    const spend = [...spendByClient.values()].reduce((s, v) => s + v, 0);
    return computeStats(leads, spend);
  }, [leads, spendByClient]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }));

  const exportCsv = () =>
    downloadCsv(`agency-overview-${range.from.toISOString().slice(0, 10)}.csv`, [
      [
        t("agency.colClient"),
        t("agency.colSpend"),
        t("agency.realConversations"),
        t("agency.csvPending"),
        t("agency.csvTrash"),
        t("agency.csvCost"),
        t("agency.csvTrashRatio"),
      ],
      ...rows.map((r) => [
        r.client.name,
        r.stats.spend.toFixed(2),
        r.stats.real,
        r.stats.pending,
        r.stats.trash,
        r.stats.costPerReal?.toFixed(2) ?? "",
        r.stats.trashRatio.toFixed(1),
      ]),
    ]);

  const openClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (c) setSelectedClient(c);
    navigate("/");
  };

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-6 py-3 text-start text-xs font-medium text-muted-foreground uppercase">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k)}>
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );

  return (
    <DashboardLayout
      title={t("agency.title")}
      subtitle={t("agency.subtitle", { name: agency?.name ?? t("agency.yourAgency") })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <DateRangePicker value={range} onChange={setRange} />
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="w-4 h-4" />
          {t("common.exportCsv")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard title={t("agency.activeClients")} value={clients.length} icon={<Building2 className="w-5 h-5" />} />
        <MetricCard title={t("agency.totalSpend")} value={`$${totals.spend.toFixed(2)}`} icon={<DollarSign className="w-5 h-5" />} />
        <MetricCard title={t("agency.realConversations")} value={totals.real} icon={<MessageCircle className="w-5 h-5" />} />
        <MetricCard title={t("agency.trashRatio")} value={`${totals.trashRatio.toFixed(1)}%`} icon={<AlertTriangle className="w-5 h-5" />} />
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !clients.length ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground mb-4">{t("agency.noClients")}</p>
            <Button onClick={() => navigate("/clients")}>{t("agency.addClient")}</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <Th k="name" label={t("agency.colClient")} />
                  <Th k="spend" label={t("agency.colSpend")} />
                  <Th k="real" label={t("agency.colReal")} />
                  <Th k="cost" label={t("agency.colCost")} />
                  <Th k="trash" label={t("agency.colTrash")} />
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ client, stats }) => (
                  <tr key={client.id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="px-6 py-4 font-medium text-foreground">{client.name}</td>
                    <td className="px-6 py-4 text-foreground">${stats.spend.toFixed(2)}</td>
                    <td className="px-6 py-4 text-success font-semibold">{stats.real}</td>
                    <td className="px-6 py-4 text-foreground">{stats.costPerReal !== null ? `$${stats.costPerReal.toFixed(2)}` : "—"}</td>
                    <td className={`px-6 py-4 ${stats.trashRatio > 50 ? "text-destructive" : "text-muted-foreground"}`}>
                      {stats.trashRatio.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Button size="sm" variant="ghost" onClick={() => openClient(client.id)}>
                        {t("common.open")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AgencyOverview;
