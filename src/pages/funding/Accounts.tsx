import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FundButton } from "@/components/funding/FundButton";
import { useBcAccounts } from "@/components/funding/useBcAccounts";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import type { FundingContext } from "../Funding";

type Live = { balance: number | null; currency: string | null };
type Balances = {
  businessCenters: { accounts: { advertiserId: string; balance: number | null; currency: string | null }[] }[];
};
type Diagnosis = {
  businessCenters: {
    code: number;
    message: string;
    list: {
      id: string;
      name: string | null;
      role: string | null;
      financeRole: string | null;
      balanceList: { code: number; message: string; count: number; total: number | null } | null;
      assets: {
        code: number;
        message: string;
        total: number | null;
        items: { id: string; name: string | null; permission: string | null }[];
      };
    }[];
  };
  authorizedAdAccounts: { code: number; message: string; count: number };
};

// Balances older than this are refreshed in the background when the page opens.
const STALE_MS = 15 * 60 * 1000;

/** Every ad account in the agency's Business Centers. Names appear at once; balances fill in as TikTok answers. */
export default function Accounts() {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { agencyId, connect, connecting } = useOutletContext<FundingContext>();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("advertiser");
  const { accounts, reload, updatedAt } = useBcAccounts(agencyId);
  const [live, setLive] = useState<Map<string, Live>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [search, setSearch] = useState("");
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const started = useRef(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const d = await invokeFn<Balances>("tiktok-bc", { action: "balances", agencyId });
      const next = new Map<string, Live>();
      for (const bc of d.businessCenters)
        for (const a of bc.accounts) next.set(a.advertiserId, { balance: a.balance, currency: a.currency });
      setLive(next);
      setSynced(true);
      await reload();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSyncing(false);
    }
  }, [agencyId, reload, t]);

  // Once the saved list has loaded: refresh in the background if it is empty or stale (never blocks the list).
  useEffect(() => {
    if (accounts === null || started.current) return;
    started.current = true;
    const stale = !updatedAt || Date.now() - new Date(updatedAt).getTime() > STALE_MS;
    if (stale || wanted) void sync();
  }, [accounts, updatedAt, wanted, sync]);

  const diagnose = async () => {
    setDiagBusy(true);
    try {
      setDiag(await invokeFn<Diagnosis>("tiktok-bc", { action: "diagnose", agencyId }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setDiagBusy(false);
    }
  };

  const q = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const by = new Map<string, { bcId: string; name: string; items: NonNullable<typeof accounts> }>();
    for (const a of accounts ?? []) {
      if (q && !`${a.advertiser_name ?? ""} ${a.advertiser_id}`.toLowerCase().includes(q)) continue;
      const g = by.get(a.bc_id) ?? { bcId: a.bc_id, name: a.bc_name ?? a.bc_id, items: [] };
      g.items.push(a);
      by.set(a.bc_id, g);
    }
    return [...by.values()];
  }, [accounts, q]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const wantedMissing = !!wanted && synced && !(accounts ?? []).some((a) => a.advertiser_id === wanted);
  const stillLoading = accounts === null || (accounts.length === 0 && syncing);

  const diagPanel = diag && (
    <div className="space-y-3 rounded-lg bg-secondary/50 p-3 text-start text-foreground">
      <p>
        {t("funding.visibleBcs")}:{" "}
        {diag.businessCenters.list.length === 0
          ? `${t("funding.none")} (${diag.businessCenters.message || diag.businessCenters.code})`
          : ""}
      </p>
      {diag.businessCenters.list.map((b) => (
        <div key={b.id} dir="ltr" className="space-y-1">
          <p className="font-medium">
            {b.name ?? "—"} · {b.id} · {b.role ?? "—"} · {t("funding.financeRole")}: {b.financeRole ?? "—"}
          </p>
          {b.balanceList && (
            <p className="text-xs">
              {t("funding.balanceListLine")}:{" "}
              {b.balanceList.code === 0
                ? `${b.balanceList.total ?? b.balanceList.count} account(s)`
                : `${b.balanceList.code} ${b.balanceList.message}`}
            </p>
          )}
          <p className="text-xs">
            {t("funding.assetsLine")}:{" "}
            {b.assets.code === 0
              ? `${b.assets.total ?? b.assets.items.length} account(s)`
              : `${b.assets.code} ${b.assets.message}`}
          </p>
        </div>
      ))}
      <p>{t("funding.authorizedAds", { count: diag.authorizedAdAccounts.count })}</p>
      <p className="text-xs text-muted-foreground">{t("funding.diagnoseHint")}</p>
    </div>
  );

  // Nothing saved yet and TikTok failed: the only case that shows an error instead of the list.
  if (syncError && accounts?.length === 0)
    return (
      <div className="glass-card space-y-3 border-destructive/40 p-5 text-sm">
        <p className="text-destructive">{syncError}</p>
        <p className="text-muted-foreground">{t("funding.reconnectHint")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="glow" onClick={connect} disabled={connecting}>
            <Plug className="h-4 w-4" /> {t("funding.reconnect")}
          </Button>
          <Button size="sm" variant="outline" onClick={diagnose} disabled={diagBusy}>
            {diagBusy && <Loader2 className="h-4 w-4 animate-spin" />} {t("funding.diagnose")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void sync()} disabled={syncing}>
            {t("common.refresh")}
          </Button>
        </div>
        {diagPanel}
      </div>
    );

  return (
    <div className="space-y-4">
      {wantedMissing && (
        <p className="rounded-lg border border-warning/40 p-4 text-sm text-foreground">
          {t("funding.advertiserNotFound", { id: wanted })}
        </p>
      )}
      {syncError && <p className="text-sm text-warning">{t("funding.syncFailed", { message: syncError })}</p>}

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <Input
            className="max-w-xs"
            value={search}
            placeholder={t("funding.search")}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("funding.search")}
          />
          <span className="text-xs text-muted-foreground">{t("funding.count", { count: shown })}</span>
          <span className="ms-auto flex items-center gap-2 text-xs text-muted-foreground" role="status">
            {syncing ? t("funding.updating") : updatedAt ? t("funding.updatedAt", { when: f.ago(updatedAt) }) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void sync()}
              disabled={syncing}
              aria-label={t("common.refresh")}
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            </Button>
          </span>
        </div>

        {stillLoading ? (
          <div className="space-y-2 p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
            <p>{t("funding.firstLoad")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((g) => (
              <div key={g.bcId}>
                <div className="flex flex-wrap items-center gap-3 bg-secondary/40 p-4">
                  <p className="min-w-0 flex-1 truncate font-semibold text-foreground" dir="auto">
                    {g.name}
                  </p>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {g.bcId}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("funding.count", { count: g.items.length })}</span>
                </div>
                {g.items.map((a) => {
                  const bal = live.get(a.advertiser_id);
                  return (
                    <div key={a.advertiser_id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground" dir="auto">
                          {a.advertiser_name ?? t("funding.unnamed")}
                        </p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {a.advertiser_id}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums" dir="ltr">
                        {bal
                          ? bal.balance === null
                            ? "—"
                            : f.money(bal.balance, bal.currency ?? "USD")
                          : syncing
                            ? "…"
                            : "—"}
                      </span>
                      <FundButton
                        advertiserId={a.advertiser_id}
                        name={a.advertiser_name ?? a.advertiser_id}
                        autoOpen={wanted === a.advertiser_id}
                        onDone={() => {
                          if (params.has("advertiser")) {
                            const next = new URLSearchParams(params);
                            next.delete("advertiser");
                            setParams(next, { replace: true });
                          }
                          void sync();
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && (
              <div className="space-y-3 p-8 text-center text-sm text-muted-foreground">
                <p>{accounts && accounts.length === 0 ? t("funding.noBcs") : t("funding.noAccounts")}</p>
                <Button size="sm" variant="outline" onClick={diagnose} disabled={diagBusy}>
                  {t("funding.diagnose")}
                </Button>
                {diagPanel}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
