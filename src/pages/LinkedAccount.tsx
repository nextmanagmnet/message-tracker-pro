import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Coins, DollarSign, Eye, MessageCircle, MousePointerClick, ShoppingBag, Target } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignsTable, type Campaign } from "@/components/ad-accounts/CampaignsTable";
import { useFormat } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";

const icon = "w-5 h-5";

/** One linked user's ad account: campaign numbers only, never chats or lead details. */
const LinkedAccount = () => {
  const { clientId } = useParams();
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const { agency, linkedAccounts, linkedLoading, refreshLinked } = useAgency();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  const account = linkedAccounts.find((a) => a.client_id === clientId);
  const agencyId = agency?.id;
  const found = !!account;

  // A freshly accepted invite shows up as soon as the page opens.
  useEffect(() => {
    void refreshLinked();
  }, [refreshLinked]);

  useEffect(() => {
    if (!agencyId || !clientId || !found) return;
    let cancelled = false;
    setCampaigns(null);
    supabase.rpc("agency_client_campaigns", { p_agency: agencyId, p_client: clientId }).then(({ data }) => {
      if (!cancelled) setCampaigns([...(data ?? [])].sort((a, b) => Number(b.spend) - Number(a.spend)));
    });
    return () => {
      cancelled = true;
    };
  }, [agencyId, clientId, found]);

  const back = (
    <Button asChild variant="ghost" size="sm" className="mb-6 -ms-2">
      <Link to="/agency">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {t("linked.back")}
      </Link>
    </Button>
  );

  if (!account) {
    return (
      <DashboardLayout title={t("linked.group")} subtitle={t("linked.subtitle")}>
        {back}
        {linkedLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="glass-card p-10 text-center text-muted-foreground">{t("linked.notFound")}</div>
        )}
      </DashboardLayout>
    );
  }

  const cur = account.currency;
  const spend = Number(account.spend);
  const cost = (n: number) => (n > 0 ? f.money(spend / n, cur) : "—");

  return (
    <DashboardLayout title={account.advertiser_name} subtitle={t("linked.subtitle")}>
      {back}
      <p className="mb-6 text-sm text-muted-foreground">
        {t("linked.since", { date: new Date(account.linked_at).toLocaleDateString() })}
        {" · "}
        {t("linked.lastSync", { when: account.last_synced ? f.ago(account.last_synced) : t("perf.never") })}
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t("perf.columns.spend")}
          value={f.money(spend, cur)}
          icon={<DollarSign className={icon} />}
        />
        <MetricCard
          title={t("perf.columns.clicks")}
          value={f.num(account.clicks)}
          icon={<MousePointerClick className={icon} />}
        />
        <MetricCard
          title={t("linked.impressions")}
          value={f.num(account.impressions)}
          icon={<Eye className={icon} />}
        />
        <MetricCard
          title={t("perf.columns.chats")}
          value={f.num(account.chats)}
          icon={<MessageCircle className={icon} />}
        />
        <MetricCard
          title={t("perf.columns.qualified")}
          value={f.num(account.qualified)}
          icon={<Target className={icon} />}
        />
        <MetricCard
          title={t("perf.columns.orders")}
          value={f.num(account.orders)}
          icon={<ShoppingBag className={icon} />}
        />
        <MetricCard
          title={t("perf.columns.revenue")}
          value={f.money(account.revenue, cur)}
          icon={<Coins className={icon} />}
        />
        <MetricCard
          title={t("perf.columns.cpl")}
          value={cost(Number(account.qualified))}
          hint={`${t("perf.columns.cpo")}: ${cost(Number(account.orders))}`}
          icon={<Target className={icon} />}
        />
      </div>

      <div className="glass-card overflow-x-auto p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("linked.campaigns")}</h2>
        <CampaignsTable campaigns={campaigns} currency={cur} />
      </div>
    </DashboardLayout>
  );
};

export default LinkedAccount;
