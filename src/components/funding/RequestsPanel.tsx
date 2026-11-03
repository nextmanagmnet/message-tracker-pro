import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { invokeFn, useFormat } from "@/components/leads/shared";

type Req = {
  id: string;
  advertiser_id: string;
  advertiser_name: string | null;
  client_name: string | null;
  amount: number;
  currency: string;
  note: string | null;
  status: "pending" | "approved" | "declined" | "cancelled" | "failed";
  error: string | null;
  created_at: string;
};

const DONE_COLOR: Record<string, string> = {
  approved: "text-success",
  declined: "text-muted-foreground",
  cancelled: "text-muted-foreground",
  failed: "text-destructive",
};

const label = (r: Req) => r.advertiser_name ?? r.advertiser_id;

/** Top-up requests sent to this agency by clients; approving moves money from the account's own Business Center. */
export function RequestsPanel({
  agencyId,
  canManage,
  bcNameOf,
  reloadKey,
  onChanged,
}: {
  agencyId: string;
  canManage: boolean;
  /** Business Center name for an ad account, null when no BC this login can finance lists it, undefined while loading. */
  bcNameOf: ((advertiserId: string) => string | null) | undefined;
  reloadKey: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation("features");
  const f = useFormat();
  const [rows, setRows] = useState<Req[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Req | null>(null);

  const load = useCallback(async () => {
    // client_name arrives with a later migration, so the row type is cast until types are regenerated.
    const { data } = await supabase
      .from("topup_requests")
      .select("*")
      .eq("funding_agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(60);
    setRows((data ?? []) as unknown as Req[]);
    setLoaded(true);
  }, [agencyId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending").slice(0, 10);
  const bcFor = (r: Req) => (bcNameOf ? bcNameOf(r.advertiser_id) : undefined);

  const approve = async () => {
    if (!confirm) return;
    const r = confirm;
    setBusyId(r.id);
    try {
      // No amount: the server uses the request's own amount.
      const res = await invokeFn<{ status: string }>("tiktok-bc", {
        action: "fund",
        agencyId,
        advertiserId: r.advertiser_id,
        requestId: r.id,
      });
      if (res.status === "unknown") toast.warning(t("funding.unknown"));
      else toast.success(t("funding.done", { amount: f.money(Number(r.amount), r.currency), name: label(r) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusyId(null);
      setConfirm(null);
      load();
      onChanged();
    }
  };

  const decline = async (r: Req) => {
    setBusyId(r.id);
    try {
      await invokeFn("topup-requests", { action: "decline", requestId: r.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusyId(null);
      load();
    }
  };

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <h3 className="font-semibold text-foreground">{t("funding.requests")}</h3>
        {pending.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {pending.length}
          </span>
        )}
      </div>
      {!loaded ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t("funding.requestsEmpty")}</p>
      ) : (
        <div className="divide-y divide-border">
          {pending.map((r) => {
            const bc = bcFor(r);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-medium text-foreground" dir="auto">
                    {r.client_name ?? "—"} · {label(r)}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {r.advertiser_id}
                  </p>
                  {r.note && (
                    <p className="text-xs text-foreground" dir="auto">
                      {r.note}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("funding.requestedAgo", { time: f.ago(r.created_at) })}
                    {bc && ` · ${t("funding.fromBc", { name: bc })}`}
                  </p>
                  {bc === null && <p className="text-xs text-warning">{t("funding.requestNoBc")}</p>}
                  {r.error && (
                    <p className="text-xs text-destructive">{t("funding.requestLastError", { message: r.error })}</p>
                  )}
                </div>
                <span className="font-semibold text-foreground" dir="ltr">
                  {f.money(Number(r.amount), r.currency)}
                </span>
                {canManage && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => decline(r)} disabled={busyId !== null}>
                      {t("funding.decline")}
                    </Button>
                    <Button
                      size="sm"
                      variant="glow"
                      onClick={() => setConfirm(r)}
                      disabled={busyId !== null || typeof bc !== "string"}
                    >
                      {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin" />} {t("funding.approve")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {pending.length === 0 && (
            <p className="p-5 text-center text-sm text-muted-foreground">{t("funding.requestsNonePending")}</p>
          )}
          {decided.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {r.client_name ?? "—"} · {label(r)} · {f.date(r.created_at)}
              </span>
              <span dir="ltr">{f.money(Number(r.amount), r.currency)}</span>
              <span className={cn("font-medium", DONE_COLOR[r.status])}>{t(`funding.requestStatus.${r.status}`)}</span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && !busyId && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("funding.approveTitle")}</DialogTitle>
            <DialogDescription>
              {confirm &&
                t("funding.approveLine", {
                  amount: f.money(Number(confirm.amount), confirm.currency),
                  name: label(confirm),
                  bc: bcFor(confirm) ?? "—",
                })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={!!busyId}>
              {t("catalog.cancel")}
            </Button>
            <Button variant="glow" onClick={approve} disabled={!!busyId}>
              {busyId && <Loader2 className="h-4 w-4 animate-spin" />} {t("funding.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
