import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Clock, Pause, Play, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeFn } from "@/components/leads/shared";
import { type AdReview, type Launch, launchParams, readableStatus } from "./api";

type Status = { campaign: { status: string | null; operation: string | null } | null; ads: AdReview[] };

/** A launch's TikTok review status per ad, with pause / resume / delete. */
export function LaunchStatus({
  clientId,
  launch,
  onChange,
}: {
  clientId: string;
  launch: Launch;
  onChange?: (l: Launch) => void;
}) {
  const { t } = useTranslation("launch");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const op = launchParams(launch).operation;

  const load = useCallback(async () => {
    if (!launch.tiktok_campaign_id) return;
    setBusy("load");
    try {
      setStatus(await invokeFn<Status>("tiktok-ads", { action: "status", clientId, launchId: launch.id }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(null);
    }
  }, [clientId, launch.id, launch.tiktok_campaign_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const set = async (to: "pause" | "resume" | "delete") => {
    if (to === "resume" && !confirm(t("status.confirmResume"))) return;
    if (to === "delete" && !confirm(t("status.confirmDelete"))) return;
    setBusy(to);
    try {
      const d = await invokeFn<{ launch: Launch }>("tiktok-ads", {
        action: "set-status",
        clientId,
        launchId: launch.id,
        status: to,
        confirm: to === "resume",
      });
      onChange?.(d.launch);
      toast.success(t(`status.done.${to}`));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(null);
    }
  };

  if (launch.status === "failed")
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" dir="auto">
        {launch.error ?? t("error")}
      </p>
    );
  if (!launch.tiktok_campaign_id) return <p className="text-sm text-muted-foreground">{t("status.launching")}</p>;

  const deleted = op === "DELETE";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("status.campaign")}:</span>
        <span className="font-medium text-foreground">
          {deleted ? t("status.deleted") : readableStatus(status?.campaign?.status ?? null)}
        </span>
        <span className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={load} disabled={!!busy} aria-label={t("status.refresh")}>
            <RefreshCw className={busy === "load" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          {!deleted && (
            <>
              {op === "ENABLE" ? (
                <Button size="sm" variant="outline" onClick={() => set("pause")} disabled={!!busy}>
                  <Pause className="h-4 w-4" /> {t("status.pause")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => set("resume")} disabled={!!busy}>
                  <Play className="h-4 w-4" /> {t("status.resume")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => set("delete")} disabled={!!busy}>
                <Trash2 className="h-4 w-4" /> {t("status.delete")}
              </Button>
            </>
          )}
        </span>
      </div>
      {status && !deleted && (
        <ul className="space-y-2">
          {status.ads.map((a) => (
            <li key={a.adId} className="rounded-lg bg-secondary/50 p-3 text-sm">
              <div className="flex items-center gap-2">
                {a.approved === true ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : a.approved === false ? (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                )}
                <span className="font-medium text-foreground" dir="auto">
                  {a.name ?? a.adId}
                </span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {a.approved === true
                    ? t("status.approved")
                    : a.approved === false
                      ? t("status.rejected")
                      : t("status.inReview")}{" "}
                  · <span dir="ltr">{readableStatus(a.status)}</span>
                </span>
              </div>
              {a.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 ps-6 text-xs text-destructive" dir="auto">
                  {a.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LaunchStatus;
