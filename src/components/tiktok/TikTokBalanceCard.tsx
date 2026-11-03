import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import { balanceLevel } from "@/lib/topUp";
import { TopUpButton } from "./TopUpButton";
import { useTikTokBalance } from "./useTikTokBalance";

// The ad account balance, where people look for it. Renders nothing until a TikTok account is connected.
export function TikTokBalanceCard({ clientId, className }: { clientId: string; className?: string }) {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { accounts, failed, reload } = useTikTokBalance(clientId);

  if (!accounts || accounts.length === 0) return null;

  return (
    <section className={cn("glass-card p-5 space-y-3", className)} aria-label={t("balance.title")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground/80">
          <Wallet className="w-4 h-4 text-primary" /> {t("balance.title")}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => void reload()} aria-label={t("balance.refresh")}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      {accounts.map((a) => {
        const level = a.error ? "unknown" : balanceLevel(a.amount);
        return (
          <div key={a.advertiserId} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="min-w-[10rem]">
              <p className="text-xs text-muted-foreground">{a.name ?? t("connections.tiktok.unnamed")}</p>
              <p className="font-display text-3xl font-bold text-foreground" dir="auto">
                {a.amount === null ? "—" : f.money(a.amount, a.currency ?? "USD")}
              </p>
            </div>
            <p
              className={cn(
                "flex flex-1 items-center gap-2 text-sm",
                level === "empty" || level === "low" ? "text-warning" : "text-muted-foreground",
              )}
            >
              {level === "ok" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
              ) : level !== "unknown" ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : null}
              {a.error === "reconnect" ? (
                <span>
                  {t("balance.reconnect")}{" "}
                  <Link to="/connections?connect=tiktok" className="text-primary underline">
                    {t("connections.tiktok.reconnect")}
                  </Link>
                </span>
              ) : a.error ? (
                t("balance.unavailable")
              ) : (
                t(`balance.level.${level}`)
              )}
            </p>
            {!a.error && (
              <TopUpButton
                advertiserId={a.advertiserId}
                underBusinessCenter={a.underBusinessCenter}
                variant={level === "empty" || level === "low" ? "glow" : "outline"}
              />
            )}
          </div>
        );
      })}
      {failed && <p className="text-xs text-muted-foreground">{t("balance.unavailable")}</p>}
    </section>
  );
}
