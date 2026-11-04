import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";

type Info = {
  bcName: string | null;
  account: { balance: number | null; currency: string | null; minTransferable: number | null } | null;
  bc: { balance: number | null; currency: string | null; error: string | null } | null;
};

/**
 * Tops up a linked user's ad account straight from the agency's Business Center, with no request from the user.
 * Shows the credit on both sides first and spells out the transfer before it is sent.
 */
export function FundButton({
  advertiserId,
  name,
  size = "sm",
  onDone,
}: {
  advertiserId: string;
  name: string;
  size?: "sm" | "default";
  onDone?: () => void;
}) {
  const { t } = useTranslation("agencylinks");
  const f = useFormat();
  const { agency, can } = useAgency();
  const agencyId = agency?.id;
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [infoFailed, setInfoFailed] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !agencyId) return;
    let cancelled = false;
    setInfo(null);
    setInfoFailed(false);
    invokeFn<Info>("tiktok-bc", { action: "account-balance", agencyId, advertiserId })
      .then((d) => !cancelled && setInfo(d))
      .catch(() => !cancelled && setInfoFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, agencyId, advertiserId]);

  if (!can("funding") || !agencyId) return null;

  const cur = info?.account?.currency ?? info?.bc?.currency ?? "USD";
  const value = Number(amount);
  const valid = amount !== "" && Number.isFinite(value) && value > 0;
  const min = info?.account?.minTransferable ?? null;
  const bcCredit = info?.bc?.balance ?? null;
  const tooLittleInBc = valid && bcCredit !== null && value > bcCredit;
  const belowMin = valid && min !== null && min > 0 && value < min;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setAmount("");
  };

  const fund = async () => {
    setBusy(true);
    try {
      const r = await invokeFn<{ status: string }>("tiktok-bc", {
        action: "fund",
        agencyId,
        advertiserId,
        amount: value,
      });
      if (r.status === "unknown") toast.warning(t("fund.unknown"));
      else toast.success(t("fund.done", { amount: f.money(value, cur), name }));
      setBusy(false);
      setOpen(false);
      setAmount("");
      onDone?.();
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" aria-hidden />
        {t("fund.button")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("fund.title", { name })}</DialogTitle>
            <DialogDescription>{t("fund.hint")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1 rounded-lg bg-secondary/50 p-3 text-sm">
            {!info && !infoFailed && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label={t("fund.loading")} />
            )}
            {infoFailed && <p className="text-muted-foreground">{t("fund.infoFailed")}</p>}
            {info && (
              <>
                <p className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("fund.accountCredit")}</span>
                  <span className="font-medium tabular-nums">
                    {info.account?.balance == null ? "—" : f.money(info.account.balance, cur)}
                  </span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("fund.bcCredit", { name: info.bcName ?? t("fund.bcFallback") })}
                  </span>
                  <span className="font-medium tabular-nums">{bcCredit === null ? "—" : f.money(bcCredit, cur)}</span>
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`fund-${advertiserId}`}>{t("fund.amount")}</Label>
            <Input
              id={`fund-${advertiserId}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {min ? (
              <p className="text-xs text-muted-foreground">{t("fund.min", { amount: f.money(min, cur) })}</p>
            ) : null}
            {tooLittleInBc && <p className="text-sm text-destructive">{t("fund.bcTooLow")}</p>}
            {belowMin && (
              <p className="text-sm text-destructive">{t("fund.belowMin", { amount: f.money(min!, cur) })}</p>
            )}
            {valid && !tooLittleInBc && !belowMin && (
              <p className="rounded-lg bg-secondary/60 p-3 text-sm text-foreground">
                {t("fund.confirmLine", { amount: f.money(value, cur), bc: info?.bcName ?? t("fund.bcFallback"), name })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button variant="glow" onClick={() => void fund()} disabled={busy || !valid || tooLittleInBc || belowMin}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("fund.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
