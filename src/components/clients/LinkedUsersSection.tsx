import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DollarSign, Link2, MessageCircle, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormat } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";
import { FundButton } from "@/components/funding/FundButton";

/** Users who linked their ad account to this agency. Campaign numbers only, last 7 days. */
export function LinkedUsersSection() {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const { linkedAccounts, can } = useAgency();

  if (linkedAccounts.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="linked-users-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="linked-users-title" className="flex items-center gap-2 text-lg font-semibold">
            <Link2 className="h-4 w-4 text-primary" aria-hidden />
            {t("linked.group")}
            <span className="text-sm font-normal text-muted-foreground">
              {t("linked.count", { count: linkedAccounts.length })}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">{t("linked.sectionDesc")}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/ad-accounts">{t("linked.manage")}</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {linkedAccounts.map((a) => (
          <div key={a.link_id} className="glass-card p-6 transition-colors hover:border-primary/50">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{a.advertiser_name}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("linked.since", { date: new Date(a.linked_at).toLocaleDateString() })}
                </p>
              </div>
              <Badge variant="secondary">{t("linked.badge")}</Badge>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
              <Stat
                icon={<MessageCircle className="mx-auto mb-1 h-4 w-4 text-primary" />}
                label={t("perf.columns.chats")}
              >
                {f.num(a.chats)}
              </Stat>
              <Stat
                icon={<DollarSign className="mx-auto mb-1 h-4 w-4 text-brand-aqua" />}
                label={t("perf.columns.spend")}
              >
                {f.money(a.spend, a.currency)}
              </Stat>
              <Stat
                icon={<ShoppingBag className="mx-auto mb-1 h-4 w-4 text-accent" />}
                label={t("perf.columns.orders")}
              >
                {f.num(a.orders)}
              </Stat>
            </div>

            <div className="flex flex-col gap-2">
              {can("campaigns") && (
                <Button asChild variant="glow" className="w-full">
                  <Link to={`/linked/${a.client_id}/launch`}>{t("linked.newCampaign")}</Link>
                </Button>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link to={`/linked/${a.client_id}`}>{t("linked.view")}</Link>
              </Button>
              <FundButton size="default" advertiserId={a.advertiser_id} name={a.advertiser_name} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2 text-center">
      {icon}
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{children}</p>
    </div>
  );
}

/** The same users as a compact table for the agency overview. Fixed last-7-days window. */
export function LinkedUsersTable() {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const { linkedAccounts } = useAgency();

  if (linkedAccounts.length === 0) return null;

  const cost = (spend: number, n: number, cur: string) => (n > 0 ? f.money(spend / n, cur) : "—");

  return (
    <section className="glass-card mt-8 overflow-hidden" aria-labelledby="linked-overview-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
        <h2 id="linked-overview-title" className="flex items-center gap-2 font-semibold">
          <Link2 className="h-4 w-4 text-primary" aria-hidden />
          {t("linked.overviewTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("linked.sectionDesc")}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("perf.columns.account")}</TableHead>
            {(["spend", "chats", "qualified", "orders", "revenue", "cpl", "cpo"] as const).map((k) => (
              <TableHead key={k} className="text-end">
                {t(`perf.columns.${k}`)}
              </TableHead>
            ))}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {linkedAccounts.map((a) => (
            <TableRow key={a.link_id}>
              <TableCell className="font-medium">{a.advertiser_name}</TableCell>
              <TableCell className="text-end tabular-nums">{f.money(a.spend, a.currency)}</TableCell>
              <TableCell className="text-end tabular-nums">{f.num(a.chats)}</TableCell>
              <TableCell className="text-end tabular-nums">{f.num(a.qualified)}</TableCell>
              <TableCell className="text-end tabular-nums">{f.num(a.orders)}</TableCell>
              <TableCell className="text-end tabular-nums">{f.money(a.revenue, a.currency)}</TableCell>
              <TableCell className="text-end tabular-nums">
                {cost(Number(a.spend), Number(a.qualified), a.currency)}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {cost(Number(a.spend), Number(a.orders), a.currency)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-end">
                <FundButton advertiserId={a.advertiser_id} name={a.advertiser_name} />
                <Button asChild size="sm" variant="ghost">
                  <Link to={`/linked/${a.client_id}`}>{t("linked.view")}</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
