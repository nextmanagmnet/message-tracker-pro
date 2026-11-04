import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Landmark, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, invokeFn, useFormat } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";

type Credit = {
  bcId: string;
  name: string | null;
  balance: number | null;
  currency: string | null;
  error: string | null;
};

/** The agency's own Business Center credit: the money its users' ad accounts are funded from. */
export function BcBalanceCard({ className }: { className?: string }) {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const { agency, can } = useAgency();
  const agencyId = agency?.id;
  const allowed = can("funding");
  const [bcs, setBcs] = useState<Credit[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "not_connected" | "error">("loading");

  const load = useCallback(async () => {
    if (!agencyId) return;
    setState("loading");
    try {
      const d = await invokeFn<{ businessCenters: Credit[] }>("tiktok-bc", { action: "bc-balances", agencyId });
      setBcs(d.businessCenters);
      setState("ok");
    } catch (e) {
      setState(e instanceof ApiError && e.code === "not_connected" ? "not_connected" : "error");
    }
  }, [agencyId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return null;

  return (
    <section className={`glass-card p-5 space-y-3 ${className ?? ""}`} aria-label={t("bcBalance.title")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground/80">
          <Landmark className="h-4 w-4 text-primary" aria-hidden /> {t("bcBalance.title")}
        </h2>
        {state !== "not_connected" && (
          <Button variant="ghost" size="sm" onClick={() => void load()} aria-label={t("bcBalance.refresh")}>
            <RefreshCw className={`h-4 w-4 ${state === "loading" ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {state === "loading" && !bcs && <Skeleton className="h-16 w-full" />}

      {state === "not_connected" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("bcBalance.notConnected")}</p>
          <Button asChild size="sm">
            <Link to="/funding">{t("bcBalance.connect")}</Link>
          </Button>
        </div>
      )}

      {state === "error" && <p className="text-sm text-destructive">{t("bcBalance.error")}</p>}

      {bcs && state !== "not_connected" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bcs.length === 0 && <p className="text-sm text-muted-foreground">{t("bcBalance.none")}</p>}
          {bcs.map((bc) => (
            <div key={bc.bcId} className="rounded-xl bg-secondary/50 p-4">
              <p className="truncate text-xs text-muted-foreground">{bc.name ?? bc.bcId}</p>
              <p className="font-display text-3xl font-bold text-foreground" dir="auto">
                {bc.balance === null ? "—" : f.money(bc.balance, bc.currency ?? "USD")}
              </p>
              <p className="text-xs text-muted-foreground">
                {bc.error === "no_finance_role" ? t("bcBalance.noFinance") : t("bcBalance.available")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
