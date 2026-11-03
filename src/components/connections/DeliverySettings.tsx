import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";

type Trigger = "confirmation" | "delivery";
type Phrases = { order: string; delivery: string; return: string };

// When a sale counts (confirmation or delivery) and the delivery/return phrases WOB looks for.
export function DeliverySettings({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const { t } = useTranslation("delivery");
  const [trigger, setTrigger] = useState<Trigger>("confirmation");
  const [saved, setSaved] = useState<Phrases>({ order: "", delivery: "", return: "" });

  useEffect(() => {
    supabase
      .from("clients")
      .select("purchase_trigger, order_marker, delivery_marker, return_marker")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        setTrigger(data?.purchase_trigger === "delivery" ? "delivery" : "confirmation");
        setSaved({
          order: data?.order_marker ?? "",
          delivery: data?.delivery_marker ?? "",
          return: data?.return_marker ?? "",
        });
      });
  }, [clientId]);

  const saveTrigger = async (next: Trigger) => {
    const { error } = await supabase.from("clients").update({ purchase_trigger: next }).eq("id", clientId);
    if (error) return toast.error(t("features:common.error"));
    setTrigger(next);
    toast.success(t("trigger.saved"));
  };

  const savePhrase = async (kind: "delivery" | "return", value: string) => {
    if (value.length < 4) return toast.error(t("phrases.tooShort"));
    const others = (["order", "delivery", "return"] as const).filter((k) => k !== kind).map((k) => saved[k]);
    if (others.some((o) => o.trim().toLowerCase() === value.toLowerCase())) return toast.error(t("phrases.same"));
    const column = kind === "delivery" ? { delivery_marker: value } : { return_marker: value };
    const { error } = await supabase.from("clients").update(column).eq("id", clientId);
    if (error) return toast.error(t("features:common.error"));
    setSaved((s) => ({ ...s, [kind]: value }));
    toast.success(t("trigger.saved"));
  };

  return (
    <div className="mt-4 border-t border-border pt-3">
      <h4 className="text-sm font-semibold text-foreground">{t("trigger.label")}</h4>
      <RadioGroup
        className="mt-2"
        value={trigger}
        disabled={!canManage}
        onValueChange={(v) => saveTrigger(v === "delivery" ? "delivery" : "confirmation")}
      >
        {(["confirmation", "delivery"] as const).map((v) => (
          <div key={v} className="flex items-start gap-2">
            <RadioGroupItem id={`trigger-${v}`} value={v} className="mt-0.5" />
            <Label htmlFor={`trigger-${v}`} className="space-y-0.5 font-normal">
              <span className="block text-sm text-foreground">{t(`trigger.${v}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`trigger.${v}Hint`)}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <p className="mt-2 text-xs text-muted-foreground">{t("trigger.why")}</p>
      {trigger === "delivery" && (
        <Phrase kind="delivery" saved={saved.delivery} canManage={canManage} onSave={savePhrase} />
      )}
      <Phrase kind="return" saved={saved.return} canManage={canManage} onSave={savePhrase} />
    </div>
  );
}

function Phrase({
  kind,
  saved,
  canManage,
  onSave,
}: {
  kind: "delivery" | "return";
  saved: string;
  canManage: boolean;
  onSave: (kind: "delivery" | "return", value: string) => void;
}) {
  const { t } = useTranslation("delivery");
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const template = t(`phrases.${kind}Template`, { marker: saved });

  return (
    <div className="mt-3">
      <h5 className="text-sm font-medium text-foreground">{t(`phrases.${kind}Title`)}</h5>
      <p className="text-xs text-muted-foreground">{t(`phrases.${kind}Hint`)}</p>
      <pre dir="auto" className="mt-2 whitespace-pre-wrap rounded-lg bg-background/60 p-3 text-sm text-foreground">
        {template}
      </pre>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard.writeText(template).then(() => toast.success(t("phrases.copied")))}
        >
          <Copy className="h-4 w-4" /> {t("phrases.copy")}
        </Button>
        {canManage && (
          <>
            <div className="ms-auto min-w-[12rem] flex-1 space-y-1 sm:flex-none">
              <Label htmlFor={`${kind}-marker`} className="text-xs">
                {t("phrases.label")}
              </Label>
              <Input
                id={`${kind}-marker`}
                dir="auto"
                value={value}
                maxLength={60}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => onSave(kind, value.trim())} disabled={value.trim() === saved}>
              {t("features:common.save")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
