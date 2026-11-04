import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Info, Users } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormat } from "@/components/leads/shared";
import { CampaignsTable, type Campaign } from "./CampaignsTable";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Metric = Database["public"]["Functions"]["agency_client_metrics"]["Returns"][number];

const sum = (rows: Metric[], k: "spend" | "clicks" | "chats" | "qualified" | "orders" | "revenue") =>
  rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

export function PerformanceTab({ agencyId }: { agencyId: string }) {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const [rows, setRows] = useState<Metric[] | null>(null);
  const [open, setOpen] = useState<Metric | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("agency_client_metrics", { p_agency: agencyId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(t("common.error"));
      setRows([...(data ?? [])].sort((a, b) => Number(b.spend) - Number(a.spend)));
    });
    return () => {
      cancelled = true;
    };
  }, [agencyId, t]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCampaigns(null);
    supabase.rpc("agency_client_campaigns", { p_agency: agencyId, p_client: open.client_id }).then(({ data }) => {
      if (!cancelled) setCampaigns([...(data ?? [])].sort((a, b) => Number(b.spend) - Number(a.spend)));
    });
    return () => {
      cancelled = true;
    };
  }, [open, agencyId]);

  // Totals mix currencies only if linked accounts differ, so money totals use the first row's currency.
  const currency = rows?.[0]?.currency ?? "USD";
  const ratio = (cost: number, n: number, cur: string) => (n > 0 ? f.money(cost / n, cur) : "—");
  const totals = useMemo(
    () => (rows ? { spend: sum(rows, "spend"), qualified: sum(rows, "qualified"), orders: sum(rows, "orders") } : null),
    [rows],
  );

  const note = (
    <p className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {t("perf.privacy")}
    </p>
  );

  if (!rows || !totals) return <Skeleton className="h-64 w-full" />;

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {note}
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{t("perf.emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("perf.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {note}
      <div className="glass-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("perf.columns.account")}</TableHead>
              {(["spend", "clicks", "chats", "qualified", "orders", "revenue", "cpl", "cpo"] as const).map((k) => (
                <TableHead key={k} className="text-end">
                  {t(`perf.columns.${k}`)}
                </TableHead>
              ))}
              <TableHead>{t("perf.columns.synced")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.link_id} className="cursor-pointer">
                <TableCell>
                  <button
                    type="button"
                    className="text-start font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                    aria-label={t("perf.open", { name: r.advertiser_name })}
                    onClick={() => setOpen(r)}
                  >
                    {r.advertiser_name}
                  </button>
                </TableCell>
                <TableCell className="text-end tabular-nums">{f.money(r.spend, r.currency)}</TableCell>
                <TableCell className="text-end tabular-nums">{f.num(r.clicks)}</TableCell>
                <TableCell className="text-end tabular-nums">{f.num(r.chats)}</TableCell>
                <TableCell className="text-end tabular-nums">{f.num(r.qualified)}</TableCell>
                <TableCell className="text-end tabular-nums">{f.num(r.orders)}</TableCell>
                <TableCell className="text-end tabular-nums">{f.money(r.revenue, r.currency)}</TableCell>
                <TableCell className="text-end tabular-nums">{ratio(r.spend, r.qualified, r.currency)}</TableCell>
                <TableCell className="text-end tabular-nums">{ratio(r.spend, r.orders, r.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.last_synced ? f.ago(r.last_synced) : t("perf.never")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">{t("perf.totals")}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">{f.money(totals.spend, currency)}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">{f.num(sum(rows, "clicks"))}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">{f.num(sum(rows, "chats"))}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">{f.num(totals.qualified)}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">{f.num(totals.orders)}</TableCell>
              <TableCell className="text-end font-semibold tabular-nums">
                {f.money(sum(rows, "revenue"), currency)}
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums">
                {ratio(totals.spend, totals.qualified, currency)}
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums">
                {ratio(totals.spend, totals.orders, currency)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{open?.advertiser_name}</SheetTitle>
            <SheetDescription>{t("perf.sheetDesc")}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <CampaignsTable campaigns={campaigns} currency={open?.currency} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
