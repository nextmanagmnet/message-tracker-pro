import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useFormat } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import { type Launch, launchParams } from "./api";
import { LaunchStatus } from "./LaunchStatus";

const TONE: Record<string, string> = {
  launched: "text-success",
  launching: "text-warning",
  draft: "text-muted-foreground",
  failed: "text-destructive",
};

/** The client's last few launches from the campaign launcher, each opening its review status. */
export function RecentLaunches({ clientId }: { clientId: string }) {
  const { t } = useTranslation("launch");
  const f = useFormat();
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [open, setOpen] = useState<Launch | null>(null);

  useEffect(() => {
    supabase
      .from("ad_launches")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setLaunches(data ?? []));
  }, [clientId]);

  if (!launches.length) return null;
  const replace = (l: Launch) => {
    setLaunches((all) => all.map((x) => (x.id === l.id ? l : x)));
    setOpen(l);
  };

  return (
    <div className="glass-card mb-6 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
        <Rocket className="h-4 w-4 text-primary" /> {t("recent.title")}
      </h3>
      <ul className="divide-y divide-border">
        {launches.map((l) => {
          const p = launchParams(l);
          return (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-start text-sm hover:bg-secondary/40"
                onClick={() => setOpen(l)}
              >
                <span className="font-medium text-foreground" dir="auto">
                  {p.name}
                </span>
                <span className={cn("text-xs", TONE[l.status])}>
                  {p.operation === "DELETE" ? t("status.deleted") : t(`recent.status.${l.status}`)}
                </span>
                {p.dailyBudget !== null && (
                  <span className="text-xs text-muted-foreground">
                    {t("recent.perDay", { amount: f.money(p.dailyBudget, "USD") })}
                  </span>
                )}
                <span className="ms-auto text-xs text-muted-foreground">{f.ago(l.created_at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle dir="auto">{open ? launchParams(open).name : ""}</DialogTitle>
          </DialogHeader>
          {open && <LaunchStatus clientId={clientId} launch={open} onChange={replace} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RecentLaunches;
