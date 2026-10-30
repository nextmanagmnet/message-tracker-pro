import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bot, Check, Megaphone, MessageCircle, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/hooks/useAgency";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher, ThemeToggle } from "@/components/brand/PreferenceControls";
import { WhatsAppConnectDialog } from "@/components/whatsapp/WhatsAppConnectDialog";
import { cn } from "@/lib/utils";

type StepId = "whatsapp" | "ads" | "ai" | "finish";
const STEPS: StepId[] = ["whatsapp", "ads", "ai", "finish"];

const Onboarding = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedClient } = useAgency();
  const [step, setStep] = useState<StepId>("whatsapp");
  const [qrOpen, setQrOpen] = useState(false);
  const [done, setDone] = useState({ whatsapp: false, tiktok: false, meta: false, ai: false });

  const refresh = useCallback(async () => {
    if (!selectedClient) return;
    const id = selectedClient.id;
    const head = { count: "exact" as const, head: true };
    const has = ({ count, error }: { count: number | null; error: unknown }) => !error && (count ?? 0) > 0;
    const [wa, tt, mt, ai] = await Promise.all([
      supabase.from("whatsapp_numbers").select("id", head).eq("client_id", id).eq("status", "connected"),
      supabase.from("tiktok_accounts").select("id", head).eq("client_id", id),
      supabase.from("meta_accounts").select("id", head).eq("client_id", id),
      supabase.from("ai_agent_settings").select("id", head).eq("client_id", id),
    ]);
    const [whatsapp, tiktok, meta] = [has(wa), has(tt), has(mt)];
    setDone({ whatsapp, tiktok, meta, ai: has(ai) });
  }, [selectedClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const index = STEPS.indexOf(step);
  const goNext = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  const goBack = () => setStep(STEPS[Math.max(index - 1, 0)]);

  const stepDone: Record<StepId, boolean> = {
    whatsapp: done.whatsapp,
    ads: done.tiktok || done.meta,
    ai: done.ai,
    finish: false,
  };

  const meta: Record<StepId, { icon: typeof Bot; title: string; desc: string }> = {
    whatsapp: { icon: MessageCircle, title: t("onboarding.stepWhatsapp"), desc: t("onboarding.stepWhatsappDesc") },
    ads: { icon: Megaphone, title: t("onboarding.stepAds"), desc: t("onboarding.stepAdsDesc") },
    ai: { icon: Bot, title: t("onboarding.stepAi"), desc: t("onboarding.stepAiDesc") },
    finish: { icon: PartyPopper, title: t("onboarding.finishTitle"), desc: t("onboarding.finishDesc") },
  };
  const current = meta[step];

  return (
    <div className="dark min-h-screen wob-mesh-hero text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo variant="horizontal" onDark className="h-10" />
        <div className="flex gap-1 text-white">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8 text-white">
            <h1 className="text-3xl font-bold mb-3">{t("onboarding.title")}</h1>
            <p className="text-white/75">{t("onboarding.subtitle")}</p>
          </div>

          {/* Stepper */}
          <ol className="flex items-center justify-center gap-2 mb-6">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <button
                  onClick={() => setStep(s)}
                  aria-label={meta[s].title}
                  aria-current={s === step ? "step" : undefined}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                    s === step
                      ? "bg-white text-black"
                      : stepDone[s]
                      ? "bg-brand-aqua text-black"
                      : "bg-white/15 text-white"
                  )}
                >
                  {stepDone[s] ? <Check className="h-4 w-4" /> : i + 1}
                </button>
                {i < STEPS.length - 1 && <span className="h-px w-8 bg-white/25" />}
              </li>
            ))}
          </ol>

          <div className="bg-card/90 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-elevated">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
              {t("onboarding.stepOf", { current: index + 1, total: STEPS.length })}
            </p>
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-xl bg-primary/15">
                <current.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                  {current.title}
                  {stepDone[step] && <span className="badge-verified">{t("onboarding.doneBadge")}</span>}
                </h2>
                <p className="text-sm text-muted-foreground">{current.desc}</p>
              </div>
            </div>

            {!selectedClient && step !== "finish" && (
              <p className="text-sm text-warning mb-4">{t("onboarding.noClient")}</p>
            )}

            <div className="flex flex-wrap gap-3">
              {step === "whatsapp" && (
                <Button variant="glow" disabled={!selectedClient} onClick={() => setQrOpen(true)}>
                  <MessageCircle className="h-4 w-4" />
                  {t("onboarding.connectWhatsapp")}
                </Button>
              )}
              {step === "ads" && (
                <>
                  <Button variant="glow" disabled={!selectedClient} onClick={() => navigate("/connections?connect=tiktok")}>
                    {t("onboarding.connectTiktok")}
                    {done.tiktok && <Check className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" disabled={!selectedClient} onClick={() => navigate("/connections")}>
                    {t("onboarding.connectMeta")}
                    {done.meta && <Check className="h-4 w-4" />}
                  </Button>
                </>
              )}
              {step === "ai" && (
                <Button variant="glow" onClick={() => navigate("/ai-agent")}>
                  <Bot className="h-4 w-4" />
                  {t("onboarding.openAiAgent")}
                </Button>
              )}
              {step === "finish" && (
                <Button variant="glow" onClick={() => navigate("/")}>
                  {t("onboarding.goToDashboard")}
                </Button>
              )}
            </div>

            {step !== "finish" && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                <Button variant="ghost" onClick={goBack} disabled={index === 0}>
                  {t("common.back")}
                </Button>
                <Button variant="outline" onClick={goNext}>
                  {stepDone[step] ? t("common.next") : t("common.skip")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {selectedClient && (
        <WhatsAppConnectDialog
          open={qrOpen}
          onOpenChange={setQrOpen}
          clientId={selectedClient.id}
          onSuccess={() => {
            refresh();
            goNext();
          }}
        />
      )}
    </div>
  );
};

export default Onboarding;
