import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFormat } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import { entryKind } from "@/lib/wallet";

type Entry = {
  id: string;
  amount: number;
  balance_after: number;
  kind: string;
  note: string | null;
  created_at: string;
};

export function WalletHistory({
  clientId,
  currency,
  reloadKey,
}: {
  clientId: string;
  currency: string;
  reloadKey: number;
}) {
  const { t } = useTranslation("wallet");
  const f = useFormat();
  const [rows, setRows] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("wallet_entries")
      .select("id, amount, balance_after, kind, note, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled) setRows(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, reloadKey]);

  return (
    <section className="glass-card overflow-hidden">
      <h2 className="border-b border-border p-4 font-semibold text-foreground">{t("history")}</h2>
      {rows === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{t("col.date")}</th>
                <th className="p-3 text-start font-medium">{t("col.kind")}</th>
                <th className="p-3 text-end font-medium">{t("col.amount")}</th>
                <th className="p-3 text-end font-medium">{t("col.balance")}</th>
                <th className="p-3 text-start font-medium">{t("col.note")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">{f.date(r.created_at)}</td>
                  <td className="p-3 text-foreground">{t(`kind.${entryKind(r.kind)}`)}</td>
                  <td
                    className={cn(
                      "whitespace-nowrap p-3 text-end font-semibold",
                      r.amount > 0 ? "text-success" : "text-destructive",
                    )}
                    dir="ltr"
                  >
                    {r.amount > 0 ? "+" : ""}
                    {f.money(r.amount, currency)}
                  </td>
                  <td className="whitespace-nowrap p-3 text-end text-muted-foreground" dir="ltr">
                    {f.money(r.balance_after, currency)}
                  </td>
                  <td className="p-3 text-muted-foreground" dir="auto">
                    {r.note ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
