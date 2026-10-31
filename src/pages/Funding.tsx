import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Banknote, Loader2, Plug, RefreshCw, Unplug } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { BC_KEY, beginOAuth } from "@/components/connections/oauth";

type Conn = { bc_id: string | null; bc_name: string | null; max_transfer: number };
type Account = { advertiserId: string; name: string | null; balance: number | null; currency: string | null; minTransferable: number | null; clientId: string | null };
type Balances = { bcId: string; maxTransfer: number; bcBalance: Record<string, unknown> | null; accounts: Account[]; sample: unknown };
type Diagnosis = {
  savedBcId: string | null;
  businessCenters: { code: number; message: string; list: { id: string; name: string | null; role: string | null }[] };
  authorizedAdAccounts: { code: number; message: string; count: number };
  balanceList: { code: number; message: string; count: number; total: number | null } | null;
  assets: { code: number; message: string; total: number | null; items: { id: string; name: string | null; permission: string | null }[] } | null;
};
type Transfer = { id: string; advertiser_id: string; advertiser_name: string | null; amount: number; status: "pending" | "sent" | "failed" | "unknown"; response: { message?: string } | null; created_at: string };

const STATUS: Record<Transfer["status"], string> = {
  sent: "text-success",
  pending: "text-warning",
  unknown: "text-warning",
  failed: "text-destructive",
};

const Funding = () => {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { agency, canManage } = useAgency();
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [data, setData] = useState<Balances | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bcInput, setBcInput] = useState("");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Account | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diagnosis | null>(null);

  const agencyId = agency?.id;

  const loadConn = useCallback(async () => {
    if (!agencyId) return;
    const { data: row } = await supabase.from("bc_connections").select("bc_id, bc_name, max_transfer").eq("agency_id", agencyId).maybeSingle();
    setConn((row as Conn | null) ?? null);
  }, [agencyId]);

  const loadTransfers = useCallback(async () => {
    if (!agencyId) return;
    const { data: rows } = await supabase.from("fund_transfers")
      .select("id, advertiser_id, advertiser_name, amount, status, response, created_at")
      .eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(50);
    setTransfers((rows ?? []) as Transfer[]);
  }, [agencyId]);

  const loadBalances = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await invokeFn<Balances>("tiktok-bc", { action: "balances", agencyId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [agencyId, t]);

  useEffect(() => {
    loadConn();
    loadTransfers();
  }, [loadConn, loadTransfers]);

  useEffect(() => {
    if (conn?.bc_id) loadBalances();
  }, [conn?.bc_id, loadBalances]);

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

  const saveBc = async () => {
    setBusy(true);
    try {
      await invokeFn("tiktok-bc", { action: "set-bc", agencyId, bcId: bcInput.trim() });
      await loadConn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const diagnose = async () => {
    setBusy(true);
    try {
      setDiag(await invokeFn<Diagnosis>("tiktok-bc", { action: "diagnose", agencyId }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const pickBc = async (id: string, name: string | null) => {
    setBusy(true);
    try {
      await invokeFn("tiktok-bc", { action: "set-bc", agencyId, bcId: id, bcName: name });
      setDiag(null);
      await loadConn();
      await loadBalances();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm(t("funding.confirmDisconnect"))) return;
    await invokeFn("tiktok-bc", { action: "disconnect", agencyId }).catch(() => null);
    setData(null);
    setConn(null);
  };

  const fund = async () => {
    if (!target) return;
    const value = Number(amount);
    setBusy(true);
    try {
      const r = await invokeFn<{ success: boolean; status: string }>("tiktok-bc", { action: "fund", agencyId, advertiserId: target.advertiserId, amount: value });
      if (r.status === "unknown") toast.warning(t("funding.unknown"));
      else toast.success(t("funding.done", { amount: f.money(value, target.currency ?? "USD"), name: target.name ?? target.advertiserId }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
      setTarget(null);
      setAmount("");
      loadTransfers();
      loadBalances();
    }
  };

  const accounts = (data?.accounts ?? []).filter((a) => `${a.name ?? ""} ${a.advertiserId}`.toLowerCase().includes(search.toLowerCase()));
  const amountNum = Number(amount);
  const amountOk = amount !== "" && Number.isFinite(amountNum) && amountNum > 0;

  const diagPanel = diag && (
                <div className="space-y-2 rounded-lg bg-secondary/50 p-3 text-foreground">
                  <p dir="ltr">{t("funding.savedBc")}: {diag.savedBcId}</p>
                  <p>
                    {t("funding.visibleBcs")}:{" "}
                    {diag.businessCenters.list.length === 0 ? `${t("funding.none")} (${diag.businessCenters.message || diag.businessCenters.code})` : ""}
                  </p>
                  {diag.businessCenters.list.map((b) => (
                    <div key={b.id} className="flex items-center gap-2" dir="ltr">
                      <span className="flex-1">{b.name ?? "—"} · {b.id}{b.role ? ` · ${b.role}` : ""}</span>
                      <Button size="sm" onClick={() => pickBc(b.id, b.name)} disabled={busy}>{t("funding.useThis")}</Button>
                    </div>
                  ))}
                  <p>{t("funding.authorizedAds", { count: diag.authorizedAdAccounts.count })}</p>
                  {diag.balanceList && (
                    <p dir="ltr">
                      {t("funding.balanceListLine")}: {diag.balanceList.code === 0 ? `${diag.balanceList.total ?? diag.balanceList.count} account(s)` : `${diag.balanceList.code} ${diag.balanceList.message}`}
                    </p>
                  )}
                  {diag.assets && (
                    <div dir="ltr" className="space-y-1">
                      <p>{t("funding.assetsLine")}: {diag.assets.code === 0 ? `${diag.assets.total ?? diag.assets.items.length} account(s)` : `${diag.assets.code} ${diag.assets.message}`}</p>
                      {diag.assets.items.map((a) => <p key={a.id} className="text-xs text-muted-foreground">{a.name ?? "—"} · {a.id}{a.permission ? ` · ${a.permission}` : ""}</p>)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{t("funding.diagnoseHint")}</p>
                </div>
  );

  return (
    <DashboardLayout title={t("funding.title")} subtitle={t("funding.subtitle")}>
      {!canManage ? (
        <div className="glass-card p-12 text-center text-muted-foreground">{t("funding.adminsOnly")}</div>
      ) : conn === undefined ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : conn === null ? (
        <div className="glass-card wob-mesh-card mx-auto max-w-xl p-8 text-center">
          <Banknote className="mx-auto mb-3 h-8 w-8 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{t("funding.connectTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("funding.connectHint")}</p>
          <Button variant="glow" className="mt-5" onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} {t("funding.connect")}
          </Button>
        </div>
      ) : !conn.bc_id ? (
        <div className="glass-card mx-auto max-w-xl space-y-3 p-8">
          <h2 className="text-lg font-semibold text-foreground">{t("funding.bcIdTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("funding.bcIdHint")}</p>
          <Input dir="ltr" inputMode="numeric" value={bcInput} placeholder="7012345678901234567" onChange={(e) => setBcInput(e.target.value)} />
          <Button variant="glow" onClick={saveBc} disabled={busy || !bcInput.trim()}>{t("common.save")}</Button>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="glass-card flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("funding.businessCenter")}</p>
              <p className="font-semibold text-foreground" dir="ltr">{conn.bc_name ?? conn.bc_id}</p>
              {data?.bcBalance && (
                <p className="mt-1 text-sm text-muted-foreground" dir="ltr">{t("funding.bcBalance")}: {JSON.stringify(data.bcBalance)}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("funding.limit", { amount: f.money(Number(conn.max_transfer), "USD") })}</p>
            <Button variant="outline" size="sm" onClick={loadBalances} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> {t("common.refresh")}
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnect}><Unplug className="h-4 w-4" /> {t("funding.disconnect")}</Button>
          </section>

          {error ? (
            <div className="glass-card space-y-3 border-destructive/40 p-5 text-sm">
              <p className="text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={diagnose} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("funding.diagnose")}
              </Button>
              {diagPanel}
            </div>
          ) : (
            <section className="glass-card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <Input className="max-w-xs" value={search} placeholder={t("funding.search")} onChange={(e) => setSearch(e.target.value)} aria-label={t("funding.search")} />
                <span className="text-xs text-muted-foreground">{t("funding.count", { count: accounts.length })}</span>
              </div>
              {loading && !data ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : (
                <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
                  {accounts.map((a) => (
                    <div key={a.advertiserId} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground" dir="auto">{a.name ?? t("funding.unnamed")}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{a.advertiserId}</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground" dir="ltr">
                        {a.balance === null ? "—" : f.money(a.balance, a.currency ?? "USD")}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setTarget(a)}>{t("funding.fund")}</Button>
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <div className="space-y-3 p-8 text-center text-sm text-muted-foreground">
                      <p>{t("funding.noAccounts")}</p>
                      <Button size="sm" variant="outline" onClick={diagnose} disabled={busy}>{t("funding.diagnose")}</Button>
                      <div className="text-start">{diagPanel}</div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {data?.sample != null && (
            <details className="glass-card p-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("funding.rawSample")}</summary>
              <pre dir="ltr" className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data.sample, null, 2)}</pre>
            </details>
          )}

          <section className="glass-card overflow-hidden">
            <h3 className="border-b border-border p-4 font-semibold text-foreground">{t("funding.history")}</h3>
            {transfers.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("funding.noHistory")}</p>
            ) : (
              <div className="divide-y divide-border">
                {transfers.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground" dir="auto">{x.advertiser_name ?? x.advertiser_id}</p>
                      <p className="text-xs text-muted-foreground">{f.date(x.created_at)}</p>
                    </div>
                    <span className="font-semibold text-foreground" dir="ltr">{f.money(Number(x.amount), "USD")}</span>
                    <span className={cn("text-xs font-medium", STATUS[x.status])}>
                      {t(`funding.status.${x.status}`)}
                      {x.status === "failed" && x.response?.message ? ` · ${x.response.message}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && !busy && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("funding.fundTitle", { name: target?.name ?? target?.advertiserId })}</DialogTitle>
            <DialogDescription>{t("funding.fundHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fund-amount">{t("funding.amount")}</Label>
            <Input id="fund-amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {target?.minTransferable ? <p className="text-xs text-muted-foreground">{t("funding.minimum", { amount: target.minTransferable })}</p> : null}
            {amountOk && (
              <p className="rounded-lg bg-secondary/60 p-3 text-sm text-foreground">
                {t("funding.confirmLine", { amount: f.money(amountNum, target?.currency ?? "USD"), name: target?.name ?? target?.advertiserId })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>{t("catalog.cancel")}</Button>
            <Button variant="glow" onClick={fund} disabled={busy || !amountOk}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("funding.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Funding;
