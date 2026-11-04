import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/components/leads/shared";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useWallet } from "./useWallet";

/** Compact wallet balance for the dashboard. Hidden when there is nothing to show (no TikTok account, empty wallet). */
export function WalletCard({ clientId, className }: { clientId: string; className?: string }) {
  const { t } = useTranslation("wallet");
  const f = useFormat();
  const { info } = useWallet(clientId);
  const [hasTikTok, setHasTikTok] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("tiktok_accounts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .then(({ count }) => !cancelled && setHasTikTok((count ?? 0) > 0));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!info || hasTikTok === null || (!hasTikTok && info.balance <= 0)) return null;

  return (
    <section
      className={cn("glass-card flex flex-wrap items-center justify-between gap-3 p-5", className)}
      aria-label={t("title")}
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground/80">
          <Wallet className="h-4 w-4 text-primary" /> {t("title")}
        </h2>
        <p className="font-display text-3xl font-bold text-foreground" dir="auto">
          {f.money(info.balance, info.currency)}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/wallet">
          <Plus className="h-4 w-4" /> {t("addFunds")}
        </Link>
      </Button>
    </section>
  );
}
