import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Banknote, Landmark, Loader2, Plug, Unplug } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BcBalanceCard } from "@/components/funding/BcBalanceCard";
import { BcPicker } from "@/components/funding/BcPicker";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { BC_KEY, beginOAuth } from "@/components/connections/oauth";

/** What the Funding sub-pages share through the router's outlet. */
export type FundingContext = { agencyId: string; connect: () => Promise<void>; connecting: boolean };

const TABS = [
  { to: "/funding", key: "accounts", end: true },
  { to: "/funding/requests", key: "requests", end: false },
  { to: "/funding/payments", key: "payments", end: false },
  { to: "/funding/history", key: "history", end: false },
] as const;

// Funding is split into sub-pages (Accounts, Requests, Payments, History); this is their shared frame:
// who may be here, the Business Center connection, each Business Center's name and credit, and the page tabs.
const Funding = () => {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { agency, can } = useAgency();
  const canManage = can("funding");
  const agencyId = agency?.id;
  const location = useLocation();
  const [limit, setLimit] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [choosing, setChoosing] = useState(false); // the Business Center chooser
  const [needsChoice, setNeedsChoice] = useState(false); // several Business Centers and none chosen yet

  const loadConn = useCallback(async () => {
    if (!agencyId) return;
    const { data } = await supabase
      .from("bc_connections")
      .select("max_transfer, selected_bc_ids")
      .eq("agency_id", agencyId)
      .maybeSingle();
    setLimit(data ? Number(data.max_transfer) : null);
    setNeedsChoice(data?.selected_bc_ids?.length === 0);
  }, [agencyId]);

  useEffect(() => {
    void loadConn();
  }, [loadConn]);

  // The Requests tab shows how many are waiting; it refreshes as you move between the tabs.
  useEffect(() => {
    if (!agencyId || !canManage) return;
    supabase
      .from("topup_requests")
      .select("id", { count: "exact", head: true })
      .eq("funding_agency_id", agencyId)
      .eq("status", "pending")
      .then(({ count }) => setPending(count ?? 0));
  }, [agencyId, canManage, location.pathname]);

  const connect = async () => {
    if (!agencyId) return;
    setBusy(true);
    try {
      // Same TikTok login page and redirect as the client connection; the callback tells them apart by state.
      const state = beginOAuth(BC_KEY, agencyId);
      const d = await invokeFn<{ authUrl?: string }>("tiktok-oauth", {
        action: "get-auth-url",
        redirectUri: `${window.location.origin}/tiktok/callback`,
        state,
      });
      if (!d.authUrl) throw new Error(t("connections.authUrlMissing"));
      window.location.href = d.authUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm(t("funding.confirmDisconnect"))) return;
    await invokeFn("tiktok-bc", { action: "disconnect", agencyId }).catch(() => null);
    setLimit(null);
    setNeedsChoice(false);
    setChoosing(false);
  };

  const body = () => {
    if (!canManage || !agencyId)
      return <div className="glass-card p-12 text-center text-muted-foreground">{t("funding.adminsOnly")}</div>;
    if (limit === undefined)
      return (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    if (limit === null)
      return (
        <div className="glass-card wob-mesh-card mx-auto max-w-xl p-8 text-center">
          <Banknote className="mx-auto mb-3 h-8 w-8 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{t("funding.connectTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("funding.connectHint")}</p>
          <Button variant="glow" className="mt-5" onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} {t("funding.connect")}
          </Button>
        </div>
      );

    if (needsChoice || choosing)
      return (
        <BcPicker
          agencyId={agencyId}
          first={needsChoice}
          onCancel={() => setChoosing(false)}
          onSaved={() => {
            setChoosing(false);
            void loadConn();
          }}
        />
      );

    const context: FundingContext = { agencyId, connect, connecting: busy };
    return (
      <div className="space-y-6">
        <BcBalanceCard />

        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-xs text-muted-foreground">
            {t("funding.limit", { amount: f.money(limit, "USD") })}
          </p>
          <Button variant="outline" size="sm" onClick={() => setChoosing(true)}>
            <Landmark className="h-4 w-4" /> {t("funding.chooseBcs")}
          </Button>
          <Button variant="outline" size="sm" onClick={connect} disabled={busy}>
            <Plug className="h-4 w-4" /> {t("funding.reconnect")}
          </Button>
          <Button variant="ghost" size="sm" onClick={disconnect}>
            <Unplug className="h-4 w-4" /> {t("funding.disconnect")}
          </Button>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label={t("funding.title")}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              {t(`funding.tabs.${tab.key}`)}
              {tab.key === "requests" && pending > 0 && (
                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <Outlet context={context} />
      </div>
    );
  };

  return (
    <DashboardLayout title={t("funding.title")} subtitle={t("funding.subtitle")}>
      {body()}
    </DashboardLayout>
  );
};

export default Funding;
