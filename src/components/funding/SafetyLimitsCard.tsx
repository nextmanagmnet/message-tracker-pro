import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeFn } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";

type Form = { maxDailyTransfer: string; paymentApprovalOver: string; paymentDailyCap: string };
const DEFAULTS: Form = { maxDailyTransfer: "5000", paymentApprovalOver: "500", paymentDailyCap: "10000" };

/** The limits that stop one login from moving or crediting unlimited money. Funding staff see them; the owner edits. */
export function SafetyLimitsCard({ agencyId }: { agencyId: string }) {
  const { t } = useTranslation("wallet");
  const { isOwner } = useAgency();
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("agency_limits")
      .select("max_daily_transfer, payment_approval_over, payment_daily_cap")
      .eq("agency_id", agencyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data)
          setForm({
            maxDailyTransfer: String(data.max_daily_transfer),
            paymentApprovalOver: String(data.payment_approval_over),
            paymentDailyCap: String(data.payment_daily_cap),
          });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  const set = (k: keyof Form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await invokeFn("wallet", {
        action: "set-limits",
        agencyId,
        maxDailyTransfer: Number(form.maxDailyTransfer),
        paymentApprovalOver: Number(form.paymentApprovalOver),
        paymentDailyCap: Number(form.paymentDailyCap),
      });
      toast.success(t("limits.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("limits.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;

  const fields: [keyof Form, string][] = [
    ["maxDailyTransfer", "limits.dailyTransfer"],
    ["paymentApprovalOver", "limits.approvalOver"],
    ["paymentDailyCap", "limits.dailyPayments"],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-foreground">{t("limits.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("limits.hint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`lim-${k}`} className="text-xs">
              {t(label)}
            </Label>
            <Input
              id={`lim-${k}`}
              dir="ltr"
              inputMode="decimal"
              value={form[k]}
              disabled={!isOwner}
              onChange={(e) => set(k)(e.target.value)}
            />
          </div>
        ))}
      </div>
      {isOwner ? (
        <Button onClick={() => void save()} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("limits.save")}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t("limits.readOnly")}</p>
      )}
    </div>
  );
}
