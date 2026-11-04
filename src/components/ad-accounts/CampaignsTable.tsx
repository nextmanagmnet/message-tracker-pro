import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormat } from "@/components/leads/shared";
import type { Database } from "@/integrations/supabase/types";

export type Campaign = Database["public"]["Functions"]["agency_client_campaigns"]["Returns"][number];

/** Campaign numbers of a linked user's ad account. `campaigns` is null while loading. */
export function CampaignsTable({ campaigns, currency }: { campaigns: Campaign[] | null; currency?: string }) {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();

  if (!campaigns) return <Skeleton className="h-40 w-full" />;
  if (campaigns.length === 0) return <p className="text-sm text-muted-foreground">{t("perf.noCampaigns")}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("perf.campaign")}</TableHead>
          {(["spend", "clicks", "chats", "qualified", "orders", "revenue"] as const).map((k) => (
            <TableHead key={k} className="text-end">
              {t(`perf.columns.${k}`)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((c) => (
          <TableRow key={c.campaign_id}>
            <TableCell className="font-medium">{c.campaign_name}</TableCell>
            <TableCell className="text-end tabular-nums">{f.money(c.spend, currency)}</TableCell>
            <TableCell className="text-end tabular-nums">{f.num(c.clicks)}</TableCell>
            <TableCell className="text-end tabular-nums">{f.num(c.chats)}</TableCell>
            <TableCell className="text-end tabular-nums">{f.num(c.qualified)}</TableCell>
            <TableCell className="text-end tabular-nums">{f.num(c.orders)}</TableCell>
            <TableCell className="text-end tabular-nums">{f.money(c.revenue, currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
