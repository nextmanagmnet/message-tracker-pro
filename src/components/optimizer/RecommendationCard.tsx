import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/components/leads/shared";

export type Recommendation = {
  id: string;
  level: "campaign" | "adgroup" | "ad";
  target_id: string;
  kind: string;
  title: string;
  rationale: string;
  action: {
    type?: string;
    topic?: string;
    name?: string;
    from?: number;
    to?: number;
    numbers?: Record<string, number | string | null>;
    campaign?: { name?: string; wob?: Record<string, number> | null };
  };
  status: "pending" | "applied" | "dismissed" | "failed";
  result: { from?: number; to?: number; error?: string } | null;
  created_at: string;
  decided_at: string | null;
};

const MONEY = new Set(["spend", "cpq", "accountCpq", "siblingCpq", "budget", "revenue"]);
const PERCENT = new Set(["ctr", "previousCtr"]);

/** One suggestion: what, why, the numbers behind it, and (pending + allowed) Apply/Dismiss. */
export function RecommendationCard({
  rec,
  canAct,
  busy,
  onApply,
  onDismiss,
}: {
  rec: Recommendation;
  canAct: boolean;
  busy: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation("optimizer");
  const f = useFormat();
  const topic = rec.action.topic ?? rec.kind;
  const guidance = rec.action.type === "guidance";
  const value = (k: string, v: number | string | null) =>
    typeof v !== "number" ? String(v ?? "—") : MONEY.has(k) ? f.money(v) : PERCENT.has(k) ? `${v}%` : f.num(v);
  const numbers = Object.entries(rec.action.numbers ?? {}).filter(([, v]) => v !== null && v !== undefined);
  const wob = rec.action.campaign?.wob;

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`kind.${topic}`)}</Badge>
            <span className="truncate text-xs text-muted-foreground">
              {t(`level.${rec.level}`)} · {rec.action.name ?? rec.target_id}
            </span>
          </div>
          <h3 className="font-semibold text-foreground">{rec.title}</h3>
        </div>
        {rec.status !== "pending" && (
          <Badge variant={rec.status === "failed" ? "destructive" : "outline"}>{t(`status.${rec.status}`)}</Badge>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{rec.rationale}</p>

      {numbers.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {numbers.map(([k, v]) => (
            <div key={k} className="rounded-md bg-secondary/50 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t(`numbers.${k}`)}</dt>
              <dd className="font-medium text-foreground">{value(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {wob && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("campaignFunnel", {
            name: rec.action.campaign?.name ?? "",
            chats: wob.chats,
            qualified: wob.qualified,
            clients: wob.clients,
            revenue: f.money(wob.revenue),
          })}
        </p>
      )}
      <p className="mt-2 text-sm text-foreground">
        <span className="font-medium">{t("expectedLabel")}</span>{" "}
        {t(`expected.${topic}`, { from: f.money(rec.action.from), to: f.money(rec.action.to) })}
      </p>
      {rec.status === "applied" && rec.result?.to !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("appliedBudget", { from: f.money(rec.result.from), to: f.money(rec.result.to) })}
        </p>
      )}
      {rec.status === "failed" && rec.result?.error && (
        <p className="mt-1 text-xs text-destructive">{rec.result.error}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{f.ago(rec.decided_at ?? rec.created_at)}</p>

      {rec.status === "pending" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {guidance ? (
            topic === "refresh_creative" || topic === "switch_event" ? (
              <Button asChild variant="glow" size="sm">
                <Link to="/campaigns/new">
                  <ExternalLink className="h-4 w-4" /> {t("openLauncher")}
                </Link>
              </Button>
            ) : topic === "no_chats" || topic === "not_delivering" ? (
              <Button asChild variant="glow" size="sm">
                <Link to={topic === "no_chats" ? "/connections" : "/campaigns"}>
                  <ExternalLink className="h-4 w-4" /> {t(topic === "no_chats" ? "openConnections" : "openCampaigns")}
                </Link>
              </Button>
            ) : null
          ) : (
            canAct && (
              <Button variant="glow" size="sm" disabled={busy} onClick={onApply}>
                <Check className="h-4 w-4" /> {t("apply")}
              </Button>
            )
          )}
          {canAct && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onDismiss}>
              <X className="h-4 w-4" /> {guidance ? t("done") : t("dismiss")}
            </Button>
          )}
          {!canAct && !guidance && <span className="text-xs text-muted-foreground">{t("viewOnly")}</span>}
        </div>
      )}
    </div>
  );
}
