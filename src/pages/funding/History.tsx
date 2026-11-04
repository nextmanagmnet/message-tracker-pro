import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/components/leads/shared";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { FundingContext } from "../Funding";

type Transfer = {
  id: string;
  advertiser_id: string;
  advertiser_name: string | null;
  bc_id: string | null;
  bc_name: string | null;
  amount: number;
  status: "pending" | "sent" | "failed" | "unknown";
  response: { message?: string } | null;
  created_at: string;
};

const STATUS: Record<Transfer["status"], string> = {
  sent: "text-success",
  pending: "text-warning",
  unknown: "text-warning",
  failed: "text-destructive",
};

/** Every transfer sent from the agency's Business Centers, newest first. */
export default function History() {
  const { t } = useTranslation("features");
  const f = useFormat();
  const { agencyId } = useOutletContext<FundingContext>();
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);

  useEffect(() => {
    supabase
      .from("fund_transfers")
      .select("id, advertiser_id, advertiser_name, bc_id, bc_name, amount, status, response, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setTransfers((data ?? []) as unknown as Transfer[]));
  }, [agencyId]);

  if (!transfers) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="glass-card overflow-hidden">
      {transfers.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t("funding.noHistory")}</p>
      ) : (
        <div className="divide-y divide-border">
          {transfers.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground" dir="auto">
                  {x.advertiser_name ?? x.advertiser_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.date(x.created_at)}
                  {(x.bc_name ?? x.bc_id) && ` · ${t("funding.fromBc", { name: x.bc_name ?? x.bc_id })}`}
                </p>
              </div>
              <span className="font-semibold text-foreground" dir="ltr">
                {f.money(Number(x.amount), "USD")}
              </span>
              <span className={cn("text-xs font-medium", STATUS[x.status])}>
                {t(`funding.status.${x.status}`)}
                {x.status === "failed" && x.response?.message ? ` · ${x.response.message}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
