import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { invokeFn } from "@/components/leads/shared";

type Bc = { bcId: string; name: string | null; canFinance: boolean; selected: boolean };

/** Which of the login's Business Centers this agency uses. Shown right after connecting when the login has several. */
export function BcPicker({
  agencyId,
  first,
  onSaved,
  onCancel,
}: {
  agencyId: string;
  first: boolean; // true = nothing chosen yet, so there is no way to skip it
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("features");
  const [list, setList] = useState<Bc[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invokeFn<{ pending: boolean; businessCenters: Bc[] }>("tiktok-bc", { action: "list-bcs", agencyId })
      .then((d) => {
        setList(d.businessCenters);
        setPicked(new Set(d.pending ? [] : d.businessCenters.filter((b) => b.selected).map((b) => b.bcId)));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t("common.error")));
  }, [agencyId, t]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const save = async () => {
    setBusy(true);
    try {
      await invokeFn("tiktok-bc", { action: "select-bcs", agencyId, bcIds: [...picked] });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card wob-mesh-card mx-auto max-w-xl space-y-4 p-6">
      <div className="text-center">
        <Landmark className="mx-auto mb-2 h-8 w-8 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">{t("funding.pickTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("funding.pickHint")}</p>
      </div>

      {!list ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.bcId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3">
                <Checkbox checked={picked.has(b.bcId)} onCheckedChange={() => toggle(b.bcId)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {b.name ?? t("funding.unnamed")}
                  </span>
                  <span dir="ltr" className="block text-xs text-muted-foreground">
                    {b.bcId}
                  </span>
                </span>
                {!b.canFinance && <span className="text-xs text-warning">{t("funding.noFinanceRole")}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        {!first && (
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("catalog.cancel")}
          </Button>
        )}
        <Button variant="glow" onClick={save} disabled={busy || !picked.size}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("funding.pickSave", { count: picked.size })}
        </Button>
      </div>
    </div>
  );
}
