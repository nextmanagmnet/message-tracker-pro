import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeFn, useFormat } from "@/components/leads/shared";

type Issue = { code: string; level: "warn" | "tip"; values?: Record<string, number> };
type Advice = { summary: string; texts: string[] | null; message: string | null; dailyBudget: number | null };
type Review = { issues: Issue[]; advice: Advice | null; history: { costPerChat: number | null; chats: number } };

export type ReviewPlan = {
  dailyBudget: number;
  ageMin: number;
  ageMax: number;
  mediaCount: number;
  texts: string[];
  message: string;
  goal: string;
  balance: number | null;
};

const MONEY = new Set(["budget", "budgetNeeded", "perAd"]);

/**
 * The "media buyer" look at a finished campaign plan: facts the checks found from the account's own results, and the
 * AI's verdict with better texts / message / budget the person can apply in one click. It only advises: nothing is
 * changed until Apply is pressed, and nothing is launched from here.
 */
export function AiReview({
  clientId,
  plan,
  language,
  onApply,
}: {
  clientId: string;
  plan: ReviewPlan;
  language: "ar" | "en";
  onApply: (a: { texts?: string[]; message?: string; dailyBudget?: number }) => void;
}) {
  const { t } = useTranslation("launch");
  const f = useFormat();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  const run = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setReview(
        await invokeFn<Review>("tiktok-ads", {
          action: "ai-review",
          clientId,
          language,
          dailyBudget: plan.dailyBudget,
          ageMin: plan.ageMin,
          ageMax: plan.ageMax,
          mediaCount: plan.mediaCount,
          texts: plan.texts,
          message: plan.message,
          goal: plan.goal,
          balance: plan.balance ?? undefined,
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [clientId, language, plan]);

  // Once, when the review step opens; after that only on request (the plan may be mid-edit).
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, [run]);

  const advice = review?.advice;
  const changes = advice
    ? [
        advice.texts && t("aiReview.changeTexts", { n: advice.texts.length }),
        advice.message && t("aiReview.changeMessage"),
        advice.dailyBudget &&
          advice.dailyBudget !== plan.dailyBudget &&
          t("aiReview.changeBudget", { from: f.money(plan.dailyBudget), to: f.money(advice.dailyBudget) }),
      ].filter(Boolean)
    : [];

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {t("aiReview.title")}
        </h3>
        <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("aiReview.again")}
        </Button>
      </div>

      {loading && !review && <p className="text-sm text-muted-foreground">{t("aiReview.loading")}</p>}
      {failed && <p className="text-sm text-muted-foreground">{t("aiReview.failed")}</p>}

      {review && (
        <>
          {advice?.summary && (
            <p className="text-sm text-foreground" dir="auto">
              {advice.summary}
            </p>
          )}
          {review.issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> {t("aiReview.clean")}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {review.issues.map((i) => {
                const values = Object.fromEntries(
                  Object.entries(i.values ?? {}).map(([k, v]) => [k, MONEY.has(k) ? f.money(v) : v]),
                );
                const Icon = i.level === "warn" ? AlertTriangle : Lightbulb;
                return (
                  <li key={i.code} className="flex items-start gap-2 text-muted-foreground">
                    <Icon
                      className={
                        i.level === "warn" ? "mt-0.5 h-4 w-4 shrink-0 text-warning" : "mt-0.5 h-4 w-4 shrink-0"
                      }
                      aria-hidden
                    />
                    <span>{t(`aiReview.issues.${i.code}`, values)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {review.history.costPerChat !== null && (
            <p className="text-xs text-muted-foreground">
              {t("aiReview.basis", { cost: f.money(review.history.costPerChat), chats: review.history.chats })}
            </p>
          )}
          {changes.length > 0 && advice && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onApply({
                    texts: advice.texts ?? undefined,
                    message: advice.message ?? undefined,
                    dailyBudget: advice.dailyBudget ?? undefined,
                  })
                }
              >
                <Sparkles className="h-4 w-4" /> {t("aiReview.apply")}
              </Button>
              <span className="text-xs text-muted-foreground">{changes.join(" · ")}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
