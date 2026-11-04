import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { feeFor, validateSettings, type SettingsForm } from "@/lib/wallet";

type Found = { clientName: string; balance: number; currency: string };

/** Fees and payment instructions. Shown in Settings; the Funding page keeps the day-to-day tools. */
export function WalletSettingsCard({ agencyId }: { agencyId: string }) {
  const { t } = useTranslation("wallet");
  const f = useFormat();
  const [form, setForm] = useState<SettingsForm>({ commission: "0", flatFee: "0", minTopup: "10", instructions: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("agency_wallet_settings")
      .select("commission_percent, flat_fee, min_topup, payment_instructions")
      .eq("agency_id", agencyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setForm({
            commission: String(data.commission_percent),
            flatFee: String(data.flat_fee),
            minTopup: String(data.min_topup),
            instructions: data.payment_instructions ?? "",
          });
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  const error = validateSettings(form);
  const set = (k: keyof SettingsForm) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (error) return;
    setBusy(true);
    const { error: err } = await supabase.from("agency_wallet_settings").upsert({
      agency_id: agencyId,
      commission_percent: Number(form.commission),
      flat_fee: Number(form.flatFee),
      min_topup: Number(form.minTopup),
      payment_instructions: form.instructions.trim() === "" ? null : form.instructions,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (err) toast.error(t("agency.saveFailed"));
    else toast.success(t("agency.saved"));
  };

  const example = error ? null : feeFor(100, Number(form.commission), Number(form.flatFee));

  return (
    <div className="space-y-4 p-4">
      <div>
        <h4 className="font-medium text-foreground">{t("agency.settingsTitle")}</h4>
        <p className="text-sm text-muted-foreground">{t("agency.settingsHint")}</p>
      </div>
      {!loaded ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["commission", "commission"],
                ["flatFee", "flatFee"],
                ["minTopup", "minTopup"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`ws-${k}`} className="text-xs">
                  {t(`agency.${label}`)}
                </Label>
                <Input
                  id={`ws-${k}`}
                  dir="ltr"
                  inputMode="decimal"
                  value={form[k]}
                  aria-invalid={error === k}
                  onChange={(e) => set(k)(e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ws-instructions" className="text-xs">
              {t("agency.instructions")}
            </Label>
            <Textarea
              id="ws-instructions"
              dir="auto"
              rows={4}
              maxLength={1000}
              value={form.instructions}
              onChange={(e) => set("instructions")(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("agency.instructionsHint")}</p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {t(`agency.invalid.${error}`)}
            </p>
          )}
          {example !== null && (
            <p className="text-sm text-muted-foreground">
              {t("agency.example", { amount: f.money(100, "USD"), total: f.money(100 + example, "USD") })}
            </p>
          )}
          <Button onClick={() => void save()} disabled={busy || !!error}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("agency.save")}
          </Button>
        </>
      )}
    </div>
  );
}

function RecordCard({ agencyId }: { agencyId: string }) {
  const { t } = useTranslation("wallet");
  const f = useFormat();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [amount, setAmount] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // One key per form open: a double click or retry of the same payment can't credit twice.
  const [key, setKey] = useState(() => crypto.randomUUID());

  const value = Number(amount);
  const valid = amount !== "" && Number.isFinite(value) && value > 0;

  const lookup = async () => {
    setBusy(true);
    setFound(null);
    try {
      setFound(
        await invokeFn<Found>("wallet", { action: "lookup", agencyId, referenceCode: code.trim().toUpperCase() }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agency.lookupFailed"));
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (!found) return;
    setBusy(true);
    try {
      const res = await invokeFn<{ balance: number; duplicate: boolean }>("wallet", {
        action: "record-payment",
        agencyId,
        referenceCode: code.trim().toUpperCase(),
        amount: value,
        bankReference: bankRef.trim() || undefined,
        idempotencyKey: key,
        note: note.trim() || undefined,
      });
      const balance = f.money(res.balance, found.currency);
      if (res.duplicate) toast.warning(t("agency.duplicate", { balance }));
      else toast.success(t("agency.recorded", { balance }));
      setCode("");
      setFound(null);
      setAmount("");
      setBankRef("");
      setNote("");
      setKey(crypto.randomUUID());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agency.recordFailed"));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border p-4">
      <div>
        <h4 className="font-medium text-foreground">{t("agency.recordTitle")}</h4>
        <p className="text-sm text-muted-foreground">{t("agency.recordHint")}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="rp-code" className="text-xs">
            {t("agency.code")}
          </Label>
          <Input
            id="rp-code"
            dir="ltr"
            className="w-44 font-mono uppercase"
            placeholder="W-XXXXXX"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFound(null);
            }}
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy || code.trim() === ""}>
          {busy && !confirm && <Loader2 className="h-4 w-4 animate-spin" />} {t("agency.lookup")}
        </Button>
      </form>

      {found && (
        <div className="space-y-3">
          <p className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-foreground" dir="auto">
            {t("agency.found", { name: found.clientName, balance: f.money(found.balance, found.currency) })}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="rp-amount" className="text-xs">
                {t("agency.amount")}
              </Label>
              <Input
                id="rp-amount"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rp-bank" className="text-xs">
                {t("agency.bankRef")}
              </Label>
              <Input
                id="rp-bank"
                dir="ltr"
                maxLength={100}
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rp-note" className="text-xs">
                {t("agency.note")}
              </Label>
              <Input id="rp-note" dir="auto" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => setConfirm(true)} disabled={busy || !valid}>
            {t("agency.record")}
          </Button>
        </div>
      )}

      <Dialog open={confirm} onOpenChange={(o) => !o && !busy && setConfirm(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("agency.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {found &&
                t("agency.confirmLine", {
                  amount: f.money(value, found.currency),
                  name: found.clientName,
                  code: code.trim().toUpperCase(),
                })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>
              {t("requests.cancel")}
            </Button>
            <Button variant="glow" onClick={() => void record()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("agency.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Agency owner/admin: crediting a wallet when a payment arrives. Fees live in Settings. */
export function WalletsPanel({ agencyId }: { agencyId: string }) {
  const { t } = useTranslation("wallet");
  return (
    <section className="glass-card overflow-hidden">
      <h3 className="border-b border-border p-4 font-semibold text-foreground">{t("title")}</h3>
      <RecordCard agencyId={agencyId} />
    </section>
  );
}
