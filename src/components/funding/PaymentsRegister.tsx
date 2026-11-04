import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Payment = {
  id: string;
  client_name: string | null;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
  recorded_by: string;
  created_at: string;
  note: string | null;
};
type Member = { user_id: string; email: string | null; full_name: string | null };

const TONE: Record<Payment["status"], string> = {
  pending: "text-warning",
  approved: "text-success",
  rejected: "text-destructive",
};

/** Every manual payment recorded for this agency. The owner approves or rejects the ones that wait. */
export function PaymentsRegister({ agencyId, refreshKey }: { agencyId: string; refreshKey: number }) {
  const { t } = useTranslation("wallet");
  const f = useFormat();
  const { isOwner } = useAgency();
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, m, l] = await Promise.all([
      supabase
        .from("wallet_payments")
        .select("id, client_name, amount, currency, status, recorded_by, created_at, note")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.rpc("get_agency_members", { _agency_id: agencyId }),
      supabase.from("agency_limits").select("payment_approval_over").eq("agency_id", agencyId).maybeSingle(),
    ]);
    setRows((p.data ?? []) as Payment[]);
    setMembers((m.data ?? []) as Member[]);
    setThreshold(l.data ? Number(l.data.payment_approval_over) : 500);
  }, [agencyId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const who = useMemo(() => {
    const byId = new Map(members.map((x) => [x.user_id, x.full_name || x.email || ""]));
    return (id: string) => byId.get(id) || t("payments.unknownUser", { defaultValue: "—" });
  }, [members, t]);

  const decide = async (p: Payment, approve: boolean) => {
    setBusyId(p.id);
    try {
      await invokeFn("wallet", { action: "decide-payment", agencyId, paymentId: p.id, approve });
      toast.success(approve ? t("payments.approved") : t("payments.rejected"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("payments.decideFailed"));
    } finally {
      setBusyId(null);
    }
  };

  if (!rows) return <Skeleton className="h-32 w-full" />;

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-foreground">{t("payments.title")}</h3>
        {threshold !== null && (
          <p className="text-xs text-muted-foreground">
            {t("payments.waitingHint", { amount: f.money(threshold, "USD") })}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t("payments.empty")}</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground" dir="auto">
                  {p.client_name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.date(p.created_at)} · {t("payments.by", { who: who(p.recorded_by) })}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-foreground" dir="ltr">
                {f.money(Number(p.amount), p.currency)}
              </span>
              <span className={cn("text-xs font-medium", TONE[p.status])}>{t(`payments.status.${p.status}`)}</span>
              {p.status === "pending" && isOwner && (
                <span className="flex gap-2">
                  <Button size="sm" variant="glow" disabled={busyId === p.id} onClick={() => void decide(p, true)}>
                    {busyId === p.id && <Loader2 className="h-4 w-4 animate-spin" />} {t("payments.approve")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => void decide(p, false)}>
                    {t("payments.reject")}
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
