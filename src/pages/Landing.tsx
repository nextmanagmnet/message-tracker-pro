import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  Check,
  Languages,
  Link2,
  MessageCircle,
  MousePointerClick,
  Plus,
  QrCode,
  Radio,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tags,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/brand/PreferenceControls";
import { HeroFunnel } from "@/components/landing/HeroFunnel";
import { Reveal } from "@/components/landing/Reveal";
import { cn } from "@/lib/utils";
import "@/components/landing/landing.css";

type Step = { title: string; body: string };
type QA = { q: string; a: string };

const GRADIENT = "[background:var(--gradient-primary)]";

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-coral">
      <span className={cn("h-px w-6", GRADIENT)} />
      {children}
    </p>
  );
}

function SectionHead({ eyebrow, title, body, center }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <Reveal className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-2xl sm:text-4xl font-bold leading-tight break-words">{title}</h2>
      {body && <p className="mt-4 text-muted-foreground leading-relaxed">{body}</p>}
    </Reveal>
  );
}

function GetStarted({ label, className }: { label: string; className?: string }) {
  return (
    <Button asChild size="lg" className={cn("rounded-full text-white font-semibold shadow-glow hover:opacity-90", GRADIENT, className)}>
      <Link to="/auth">
        {label}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" />
      </Link>
    </Button>
  );
}

// Illustrative-only relative bar widths (no real data): A wins on clicks, B wins on buyers.
const DEMO = {
  a: { clicks: 100, chats: 64, qualified: 16, sales: 5 },
  b: { clicks: 56, chats: 44, qualified: 32, sales: 18 },
} as const;

export default function Landing() {
  const { t } = useTranslation("landing");
  const chips = t("hero.chips", { returnObjects: true }) as string[];
  const steps = t("how.steps", { returnObjects: true }) as Step[];
  const features = t("features.items", { returnObjects: true }) as Step[];
  const faqs = t("faq.items", { returnObjects: true }) as QA[];
  const featureIcons = [Tags, ShoppingBag, Radio, Wallet, Smartphone, Languages];
  const stepIcons = [QrCode, Link2, Radio];

  return (
    // Forced dark tokens: the landing is designed for the cosmic look whatever the app theme is.
    <div className="dark min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="me-auto">
            <Logo onDark className="h-8 sm:h-9" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground me-4">
            {(["how", "features", "plans", "faq"] as const).map((id) => (
              <a key={id} href={`#${id}`} className="hover:text-foreground transition-colors">
                {t(`nav.${id}`)}
              </a>
            ))}
          </nav>
          <LanguageSwitcher className="px-2" />
          <Link to="/auth" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground">
            {t("nav.signIn")}
          </Link>
          <Button asChild size="sm" className={cn("rounded-full text-white", GRADIENT)}>
            <Link to="/auth">{t("nav.getStarted")}</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="wob-mesh-hero relative isolate">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="lp-blob absolute -top-24 end-[-10%] h-[28rem] w-[28rem] rounded-full bg-brand-pink/25 blur-3xl" />
          <div className="lp-blob absolute bottom-0 start-[-15%] h-[24rem] w-[24rem] rounded-full bg-brand-blue/25 blur-3xl [animation-delay:-9s]" />
          <div className="absolute inset-0 bg-[radial-gradient(hsl(0_0%_100%/0.07)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
              <span className="pulse-dot" />
              {t("hero.eyebrow")}
            </p>
            <h1 className="mt-6 text-[1.7rem] font-extrabold leading-[1.1] sm:text-5xl lg:text-[3.6rem] break-words">
              <span className="block text-white">{t("hero.titleA")}</span>
              <span className="block text-gradient">{t("hero.titleB")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <GetStarted label={t("hero.ctaPrimary")} />
              <Button asChild size="lg" variant="ghost" className="rounded-full border border-white/15 text-white hover:bg-white/10">
                <a href="#how">{t("hero.ctaSecondary")}</a>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
              {chips.map((c) => (
                <li key={c} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-brand-aqua" />
                  {c}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150}>
            <HeroFunnel />
          </Reveal>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHead eyebrow={t("problem.eyebrow")} title={t("problem.title")} body={t("problem.body")} />
        <div className="mt-12 grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
          <Reveal className="glass-card p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <MousePointerClick className="h-4 w-4" />
              {t("problem.seeTitle")}
            </div>
            <ul className="mt-5 space-y-3">
              {(t("problem.seeItems", { returnObjects: true }) as string[]).map((s) => (
                <li key={s} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-3 text-sm">
                  <Check className="h-4 w-4 text-success" />
                  {s}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="flex items-center justify-center">
            <span className="font-display text-6xl font-extrabold text-gradient md:text-7xl" aria-hidden>
              ≠
            </span>
          </Reveal>
          <Reveal delay={240} className="glass-card wob-mesh-card p-6">
            <div className="relative flex items-center gap-2 text-sm font-semibold text-brand-coral">
              <MessageCircle className="h-4 w-4" />
              {t("problem.realTitle")}
            </div>
            <ul className="relative mt-5 space-y-3">
              {(t("problem.realItems", { returnObjects: true }) as string[]).map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm",
                    i === 0 && "bg-white/[0.03] text-muted-foreground line-through decoration-white/30",
                    i === 1 && "bg-brand-aqua/10 text-brand-aqua",
                    i === 2 && cn("text-white font-semibold", GRADIENT),
                  )}
                >
                  {i === 2 ? <ShoppingBag className="h-4 w-4" /> : i === 1 ? <BadgeCheck className="h-4 w-4" /> : <span className="h-4 w-4" />}
                  {s}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <Reveal className="mt-12 text-center">
          <p className="font-display text-xl font-bold uppercase tracking-wide text-white/90 sm:text-3xl">{t("problem.punch")}</p>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-white/5 bg-white/[0.015] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead eyebrow={t("how.eyebrow")} title={t("how.title")} center />
          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            <div aria-hidden className={cn("absolute top-10 hidden h-px md:block start-[16%] end-[16%] opacity-40", GRADIENT)} />
            {steps.map((s, i) => {
              const Icon = stepIcons[i];
              return (
                <Reveal key={s.title} delay={i * 140} className="relative">
                  <div className="glass-card h-full p-6 text-center">
                    <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-glow", GRADIENT)}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <p className="mt-5 font-display text-xs font-semibold tracking-[0.25em] text-brand-coral">0{i + 1}</p>
                    <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Demo */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:py-28">
        <SectionHead eyebrow={t("demo.eyebrow")} title={t("demo.title")} body={t("demo.body")} />
        <Reveal delay={120} className="glass-card wob-mesh-card p-5 sm:p-6">
          <div className="relative flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="pulse-dot" />
              WOB
            </span>
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-muted-foreground">{t("demo.illustrative")}</span>
          </div>
          <div className="relative mt-5 grid gap-4 sm:grid-cols-2">
            {(["a", "b"] as const).map((k, ci) => {
              const winner = k === "b";
              return (
                <div key={k} className={cn("rounded-xl border p-4", winner ? "border-brand-coral/50 bg-brand-coral/[0.06]" : "border-white/10 bg-white/[0.02]")}>
                  <p className="font-semibold">{t(k === "a" ? "demo.campaignA" : "demo.campaignB")}</p>
                  <div className="mt-4 space-y-3">
                    {(["clicks", "chats", "qualified", "sales"] as const).map((m, mi) => (
                      <div key={m}>
                        <div className="mb-1 text-xs text-muted-foreground">{t(`demo.metrics.${m}`)}</div>
                        <div className="h-2 rounded-full bg-white/5">
                          <div
                            className={cn(
                              "lp-bar h-2 rounded-full",
                              m === "clicks" ? "bg-white/30" : m === "chats" ? "bg-brand-blue" : m === "qualified" ? "bg-brand-aqua" : GRADIENT,
                            )}
                            style={{ width: `${DEMO[k][m]}%`, "--delay": `${300 + ci * 200 + mi * 120}ms` } as CSSProperties}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs">
                    {(["cpql", "cpc"] as const).map((c) => (
                      <div key={c} className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{t(`demo.${c}`)}</dt>
                        <dd className={cn("rounded-full px-2 py-0.5 font-semibold", winner ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
                          {t(winner ? "demo.lower" : "demo.higher")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className={cn("mt-4 text-sm", winner ? "font-semibold text-white" : "text-muted-foreground")}>
                    {t(winner ? "demo.verdictB" : "demo.verdictA")}
                  </p>
                </div>
              );
            })}
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
        <SectionHead eyebrow={t("features.eyebrow")} title={t("features.title")} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = featureIcons[i];
            return (
              <Reveal key={f.title} delay={(i % 3) * 100}>
                <div className="group glass-card relative h-full overflow-hidden p-6 transition-colors hover:border-brand-coral/40">
                  <div aria-hidden className={cn("absolute -top-16 end-[-4rem] h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40", GRADIENT)} />
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-brand-coral">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="relative mt-5 font-semibold">{f.title}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="scroll-mt-20 wob-mesh-cool relative py-20 lg:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionHead eyebrow={t("plans.eyebrow")} title={t("plans.title")} body={t("plans.subtitle")} center />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {(["individual", "agency"] as const).map((p, i) => {
              const agency = p === "agency";
              const Icon = agency ? Building2 : User;
              return (
                <Reveal key={p} delay={i * 140}>
                  <div
                    className={cn(
                      "relative flex h-full flex-col rounded-2xl border p-7 backdrop-blur-xl",
                      agency ? "border-brand-coral/50 bg-black/60 shadow-glow" : "border-white/10 bg-black/50",
                    )}
                  >
                    {agency && (
                      <span className={cn("absolute -top-3 end-6 rounded-full px-3 py-1 text-xs font-semibold text-white", GRADIENT)}>
                        {t("plans.agency.badge")}
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                        <Icon className="h-5 w-5 text-brand-aqua" />
                      </div>
                      <h3 className="font-display text-xl font-bold uppercase">{t(`plans.${p}.name`)}</h3>
                    </div>
                    <p className="mt-3 text-sm text-white/70">{t(`plans.${p}.tagline`)}</p>
                    <ul className="mt-6 flex-1 space-y-3">
                      {(t(`plans.${p}.items`, { returnObjects: true }) as string[]).map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-aqua" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <GetStarted label={t(`plans.${p}.cta`)} className="mt-8 w-full justify-center" />
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-white/60">{t("plans.noPricing")}</p>
        </div>
      </section>

      {/* AI add-on */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div>
          <SectionHead eyebrow={t("ai.eyebrow")} title={t("ai.title")} body={t("ai.body")} />
          <Reveal delay={100}>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-brand-aqua/40 bg-brand-aqua/10 px-3 py-1 text-xs font-semibold text-brand-aqua">
              <Sparkles className="h-3.5 w-3.5" />
              {t("ai.badge")}
            </span>
            <ul className="mt-6 space-y-3">
              {(t("ai.items", { returnObjects: true }) as string[]).map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-coral" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={150}>
          <div className="relative mx-auto w-full max-w-sm rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 shadow-elevated">
            <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-3">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-white", GRADIENT)}>
                <Bot className="h-4 w-4" />
              </div>
              <div className="h-2 w-24 rounded-full bg-white/15" />
            </div>
            <div dir="rtl" className="space-y-3 px-1 py-4 font-arabic text-sm">
              <div className="me-auto max-w-[85%] rounded-2xl rounded-ss-sm bg-white/10 px-4 py-2.5">{t("ai.chat.customer")}</div>
              <div className="ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-brand-blue/30 px-4 py-2.5">{t("ai.chat.bot")}</div>
              <div className="ms-auto grid w-[70%] grid-cols-2 gap-2 rounded-2xl rounded-se-sm bg-brand-blue/20 p-2">
                <div className="aspect-square rounded-xl wob-mesh-hero" />
                <div className="aspect-square rounded-xl wob-mesh-cool" />
                <p dir="auto" className="col-span-2 px-1 pb-1 text-xs text-white/70 font-sans">{t("ai.chat.card")}</p>
              </div>
              <div className="lp-typing me-auto flex w-14 items-center justify-center gap-1 rounded-2xl bg-white/10 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              </div>
            </div>
            <div dir="auto" className="flex items-center justify-center gap-2 rounded-full border border-success/30 bg-success/10 py-1.5 text-xs font-medium text-success">
              <User className="h-3.5 w-3.5" />
              {t("ai.chat.handoff")}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-white/5 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHead eyebrow={t("faq.eyebrow")} title={t("faq.title")} center />
          <div className="mt-12 space-y-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="lp-faq glass-card group p-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium">
                    {f.q}
                    <Plus className="lp-faq-icon h-4 w-4 shrink-0 text-brand-coral transition-transform" />
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <Reveal className="wob-mesh-hero relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 px-6 py-16 text-center sm:py-20">
          <h2 className="mx-auto max-w-3xl text-2xl font-extrabold leading-tight text-white sm:text-4xl break-words">{t("cta.title")}</h2>
          <p className="mt-4 text-white/75">{t("cta.body")}</p>
          <GetStarted label={t("cta.button")} className="mt-8" />
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo variant="mark" onDark className="h-8" />
          <span className="sm:me-auto">{t("footer.tagline")} · © {new Date().getFullYear()}</span>
          <LanguageSwitcher className="px-2" />
          <Link to="/auth" className="hover:text-foreground">
            {t("footer.signIn")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
