import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = { id: string; amount: number; currency: string; status: string; created_at: string };

const QUICK_AMOUNTS = [50, 100, 200, 500];

// Ask the agency that funds this ad account to add money. Renders nothing when nobody on WOB funds the
// account (the parent then shows the self-service steps), and reports that through onRouted.
export function TopUpRequest({
  clientId,
  advertiserId,
  onRouted,
}: {
  clientId: string;
  advertiserId: string;
  onRouted: (routed: boolean) => void;
}) {
  const { t } = useTranslation("topup");
  const f = useFormat();
  const [maxAmount, setMaxAmount] = useState<number | null>(null);
  const [routed, setRouted] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<Row[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from("topup_requests")
      .select("id, amount, currency, status, created_at")
      .eq("client_id", clientId)
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: false })
      .limit(4);
    setRequests((data ?? []) as Row[]);
  }, [clientId, advertiserId]);

  useEffect(() => {
    let cancelled = false;
    invokeFn<{ routed: boolean; maxAmount: number | null }>("topup-requests", {
      action: "routing",
      clientId,
      advertiserId,
    })
      .then((d) => {
        if (cancelled) return;
        setRouted(d.routed);
        setMaxAmount(d.maxAmount);
        onRouted(d.routed);
      })
      .catch(() => {
        if (cancelled) return;
        setRouted(false);
        onRouted(false);
      });
    void loadRequests();
    return () => {
      cancelled = true;
    };
  }, [clientId, advertiserId, loadRequests, onRouted]);

  const pending = requests.find((r) => r.status === "pending");
  const value = Number(amount);
  const valid = amount !== "" && Number.isFinite(value) && value > 0 && (maxAmount === null || value <= maxAmount);

  const send = async () => {
    setBusy(true);
    try {
      await invokeFn("topup-requests", { action: "create", clientId, advertiserId, amount: value, note });
      toast.success(t("sent"));
      setAmount("");
      setNote("");
      await loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await invokeFn("topup-requests", { action: "cancel", requestId: id });
      await loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    }
  };

  if (routed === null) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!routed) return null;

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="font-medium text-foreground">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {pending ? (
        <p className="text-sm text-foreground">
          {t("waiting", { amount: f.money(pending.amount, pending.currency) })}{" "}
          <button type="button" className="text-primary underline" onClick={() => void cancel(pending.id)}>
            {t("cancel")}
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.filter((a) => maxAmount === null || a <= maxAmount).map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={value === a ? "default" : "outline"}
                onClick={() => setAmount(String(a))}
              >
                {a}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1">
              <Label htmlFor="topup-amount" className="text-xs">
                {t("amount")}
              </Label>
              <Input
                id="topup-amount"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="topup-note" className="text-xs">
                {t("note")}
              </Label>
              <Input
                id="topup-note"
                dir="auto"
                maxLength={300}
                value={note}
                placeholder={t("notePlaceholder")}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          {maxAmount !== null && (
            <p className="text-xs text-muted-foreground">{t("max", { max: f.money(maxAmount, "USD") })}</p>
          )}
          <Button onClick={() => void send()} disabled={busy || !valid}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("send")}
          </Button>
        </div>
      )}

      {requests.filter((r) => r.status !== "pending").length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {requests
            .filter((r) => r.status !== "pending")
            .map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span dir="auto">{f.money(r.amount, r.currency)}</span>
                <span
                  className={cn(r.status === "approved" && "text-success", r.status === "declined" && "text-warning")}
                >
                  {t(`status.${r.status}`)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
