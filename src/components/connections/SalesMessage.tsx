import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

// The message the business sends on every new order; WOB counts it as a sale and reports Purchase.
export function SalesMessage({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const { t } = useTranslation("features");
  const [marker, setMarker] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    supabase.from("clients").select("order_marker").eq("id", clientId).maybeSingle().then(({ data }) => {
      setMarker(data?.order_marker ?? "");
      setSaved(data?.order_marker ?? "");
    });
  }, [clientId]);

  const template = t("sales.template", { marker: saved || "ORDER CONFIRMED" });

  const save = async () => {
    const value = marker.trim();
    if (value.length < 4) return toast.error(t("sales.tooShort"));
    const { error } = await supabase.from("clients").update({ order_marker: value }).eq("id", clientId);
    if (error) return toast.error(t("common.error"));
    setSaved(value);
    toast.success(t("sales.saved"));
  };

  return (
    <div className="mt-6 rounded-xl border border-border bg-secondary/30 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-foreground"><ShoppingBag className="h-4 w-4 text-primary" /> {t("sales.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("sales.hint")}</p>
      <pre dir="auto" className="mt-3 whitespace-pre-wrap rounded-lg bg-background/60 p-3 text-sm text-foreground">{template}</pre>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(template).then(() => toast.success(t("sales.copied")))}>
          <Copy className="h-4 w-4" /> {t("sales.copy")}
        </Button>
        {canManage && (
          <>
            <div className="ms-auto min-w-[12rem] flex-1 space-y-1 sm:flex-none">
              <Label htmlFor="order-marker" className="text-xs">{t("sales.markerLabel")}</Label>
              <Input id="order-marker" dir="auto" value={marker} maxLength={60} onChange={(e) => setMarker(e.target.value)} />
            </div>
            <Button size="sm" onClick={save} disabled={marker.trim() === saved}>{t("common.save")}</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("sales.rule")}</p>
    </div>
  );
}
