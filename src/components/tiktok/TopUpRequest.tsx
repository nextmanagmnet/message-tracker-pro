import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, invokeFn, useFormat } from "@/components/leads/shared";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/useWallet";

type Row = { id: string; amount: number; currency: string; status: string; created_at: string };

const QUICK_AMOUNTS = [50, 100, 200, 500];

type Quote = {
  amount: number;
  fee: number;
  total: number;
  balance: number;
  currency: string;
  enough: boolean;
  minTopup: number;
};

// The server reports money problems by code; anything else gets the generic message rather than raw text.
const ERROR_KEYS = ["insufficient_funds", "below_minimum", "currency_mismatch"] as const;
// The server's error code picks a translated message; any other server message is shown as it came.
const errorText = (e: unknown, t: (key: string) => string) => {
  const code = e instanceof ApiError ? e.code : undefined;
  const known = ERROR_KEYS.find((k) => k === code);
  if (known) return t(known);
  return e instanceof ApiError ? e.message : t("failed");
};

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
  const { info: wallet, reload: reloadWallet } = useWallet(clientId);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);

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
  const approving = requests.find((r) => r.status === "approving");
  const value = Number(amount);
  const valid = amount !== "" && Number.isFinite(value) && value > 0 && (maxAmount === null || value <= maxAmount);

  // Quote the fee 400 ms after the amount stops changing. Stale answers are dropped.
  useEffect(() => {
    if (!routed || !valid) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const handle = setTimeout(() => {
      invokeFn<Quote>("wallet", { action: "quote", clientId, advertiserId, amount: value })
        .then((q) => !cancelled && setQuote(q))
        .catch(() => !cancelled && setQuote(null))
        .finally(() => !cancelled && setQuoting(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [routed, valid, value, clientId, advertiserId]);

  const send = async () => {
    setBusy(true);
    try {
      await invokeFn("topup-requests", { action: "create", clientId, advertiserId, amount: value, note });
      toast.success(t("sent"));
      setAmount("");
      setNote("");
      setQuote(null);
      await Promise.all([loadRequests(), reloadWallet()]);
    } catch (e) {
      toast.error(errorText(e, t));
      void reloadWallet();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await invokeFn("topup-requests", { action: "cancel", requestId: id });
      await Promise.all([loadRequests(), reloadWallet()]);
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

      {wallet && (
        <p className="text-sm text-foreground">
          {t("walletBalance", { balance: f.money(wallet.balance, wallet.currency) })}
        </p>
      )}

      {approving ? (
        <p className="text-sm text-foreground">
          {t("approving", { amount: f.money(approving.amount, approving.currency) })}
        </p>
      ) : pending ? (
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
          {valid && (
            <div className="space-y-1 text-sm" aria-live="polite">
              {quoting && !quote ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : quote ? (
                <>
                  <p className="text-foreground" dir="auto">
                    {t("quoteLine", {
                      amount: f.money(quote.amount, quote.currency),
                      fee: f.money(quote.fee, quote.currency),
                      total: f.money(quote.total, quote.currency),
                    })}
                  </p>
                  {value < quote.minTopup ? (
                    <p className="text-warning">{t("belowMin", { min: f.money(quote.minTopup, quote.currency) })}</p>
                  ) : !quote.enough ? (
                    <p className="text-warning">
                      {t("notEnough")}{" "}
                      <Link to="/wallet" className="text-primary underline">
                        {t("addFunds")}
                      </Link>
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
          {quote && !quote.enough && value >= quote.minTopup ? (
            <Button asChild>
              <Link to="/wallet">{t("addFunds")}</Link>
            </Button>
          ) : (
            <Button
              onClick={() => void send()}
              disabled={busy || !valid || quoting || !quote || !quote.enough || value < quote.minTopup}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("send")}
            </Button>
          )}
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
