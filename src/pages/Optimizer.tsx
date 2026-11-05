import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lightbulb, Loader2, PlugZap, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { invokeFn, useFormat } from "@/components/leads/shared";
import { RecommendationCard, type Recommendation } from "@/components/optimizer/RecommendationCard";
import { useAgency } from "@/hooks/useAgency";

type ListResponse = { recommendations: Recommendation[]; hasAccount: boolean };
type Summary = {
  activeGroups: number;
  activeAds: number;
  spend: number;
  clicks: number;
  chats: number;
  judged: number;
  minSpend: number;
};
type ActionResponse = {
  reconnect?: boolean;
  noAccount?: boolean;
  created?: number;
  error?: string;
  summary?: Summary;
};
type Pending = { rec: Recommendation; action: "apply" | "dismiss" };

const Optimizer = () => {
  const { t, i18n } = useTranslation("optimizer");
  const f = useFormat();
  const { selectedClient, canManage } = useAgency();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [hasAccount, setHasAccount] = useState(true);
  const [reconnect, setReconnect] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const autoRan = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClient) return;
    try {
      const res = await invokeFn<ListResponse>("ad-optimizer", { action: "list", clientId: selectedClient.id });
      setRecs(res.recommendations);
      setHasAccount(res.hasAccount);
    } catch {
      toast.error(t("error"));
      setRecs([]);
    }
  }, [selectedClient, t]);

  useEffect(() => {
    setRecs(null);
    setReconnect(false);
    setSummary(null);
    load();
  }, [load]);

  // A 40001 / token problem comes back as { reconnect: true } rather than an error.
  const handle = (res: ActionResponse) => {
    if (res.reconnect) setReconnect(true);
    if (res.noAccount) setHasAccount(false);
    return !res.reconnect && !res.noAccount;
  };

  const analyze = async (quiet = false) => {
    if (!selectedClient) return;
    setAnalyzing(true);
    try {
      const res = await invokeFn<ActionResponse>("ad-optimizer", {
        action: "analyze",
        clientId: selectedClient.id,
        language: i18n.language === "ar" ? "ar" : "en",
      });
      if (handle(res)) {
        setReconnect(false);
        if (res.summary) setSummary(res.summary);
        if (!quiet) toast.success(res.created ? t("created", { count: res.created }) : t("noneNew"));
      }
      await load();
    } catch (e) {
      if (!quiet) toast.error(e instanceof Error ? e.message : t("error"));
    }
    setAnalyzing(false);
  };

  // Look once when the page opens, so it never sits empty just because nobody pressed the button.
  useEffect(() => {
    if (!selectedClient || recs === null || !hasAccount || autoRan.current === selectedClient.id) return;
    autoRan.current = selectedClient.id;
    analyze(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, recs, hasAccount]);

  const decide = async ({ rec, action }: Pending) => {
    setConfirm(null);
    setBusyId(rec.id);
    try {
      const res = await invokeFn<ActionResponse>("ad-optimizer", { action, id: rec.id });
      if (handle(res)) toast.success(t(action === "apply" ? "appliedToast" : "dismissedToast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    }
    setBusyId(null);
    load();
  };

  const pending = recs?.filter((r) => r.status === "pending") ?? [];
  const history = recs?.filter((r) => r.status !== "pending") ?? [];

  return (
    <DashboardLayout
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        selectedClient &&
        canManage &&
        hasAccount && (
          <Button variant="glow" onClick={() => analyze()} disabled={analyzing}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? t("analyzing") : t("analyze")}
          </Button>
        )
      }
    >
      {!selectedClient ? (
        <div className="glass-card wob-mesh-card p-12 text-center text-muted-foreground">{t("selectClient")}</div>
      ) : recs === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {(reconnect || !hasAccount) && (
            <div className="glass-card wob-mesh-card p-8 text-center">
              <PlugZap className="mx-auto mb-3 h-8 w-8 text-primary" />
              <p className="font-medium text-foreground">{t(reconnect ? "reconnect" : "noAccount")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(reconnect ? "reconnectHint" : "noAccountHint")}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/connections">{t("goToConnections")}</Link>
              </Button>
            </div>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("pending")}</h2>
            {pending.length === 0 ? (
              <div className="glass-card wob-mesh-card p-12 text-center">
                <Lightbulb className="mx-auto mb-3 h-8 w-8 text-primary" />
                <p className="font-medium text-foreground">{t("empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
                {analyzing && !summary && <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-primary" />}
              </div>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <RecommendationCard
                    key={r.id}
                    rec={r}
                    canAct={canManage}
                    busy={busyId === r.id}
                    onApply={() => setConfirm({ rec: r, action: "apply" })}
                    onDismiss={() => setConfirm({ rec: r, action: "dismiss" })}
                  />
                ))}
              </div>
            )}
          </section>

          {summary && (
            <section className="rounded-xl border border-border bg-card p-5 text-sm">
              <h2 className="mb-2 font-semibold text-foreground">{t("summary.title")}</h2>
              <p className="text-muted-foreground">
                {summary.activeGroups === 0
                  ? t("summary.none")
                  : t("summary.line", {
                      spend: f.money(summary.spend),
                      clicks: f.num(summary.clicks),
                      chats: f.num(summary.chats),
                      groups: summary.activeGroups,
                      judged: summary.judged,
                    })}
              </p>
              {summary.activeGroups > 0 && (
                <p className="mt-2 text-muted-foreground">{t("summary.why", { min: f.money(summary.minSpend) })}</p>
              )}
              {pending.length === 0 && summary.activeGroups > 0 && (
                <p className="mt-2 font-medium text-foreground">{t("summary.fine")}</p>
              )}
            </section>
          )}

          {history.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("history")}
              </h2>
              <div className="space-y-4">
                {history.map((r) => (
                  <RecommendationCard
                    key={r.id}
                    rec={r}
                    canAct={false}
                    busy={false}
                    onApply={() => {}}
                    onDismiss={() => {}}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.rec.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "apply"
                ? t(`confirmApply.${confirm.rec.kind}`, {
                    name: confirm.rec.action.name ?? confirm.rec.target_id,
                    from: confirm.rec.action.from,
                    to: confirm.rec.action.to,
                  })
                : t("confirmDismiss")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && decide(confirm)}>
              {confirm?.action === "apply" ? t("apply") : t("dismiss")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Optimizer;
