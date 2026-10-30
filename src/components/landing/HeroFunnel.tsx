import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, ShoppingBag, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// Geometry lives in a 400x500 design space; see .lp-stage in landing.css.
const at = (x: number, y: number) => ({ "--x": x, "--y": y }) as CSSProperties;

const TRASH = 70;
const QUALIFIED = 200;
const SALE = 330;

// [startX, startY, endX, endY, delay s] — clicks fall from the platform pills into the funnel.
const CLICKS = [
  [118, 54, 186, 250, 0],
  [282, 54, 214, 250, 0.3],
  [140, 54, 196, 250, 0.6],
  [262, 54, 204, 250, 0.9],
  [126, 54, 190, 250, 1.2],
  [274, 54, 210, 250, 1.5],
  [134, 54, 200, 250, 1.8],
  [266, 54, 198, 250, 2.1],
] as const;

type Kind = "trash" | "qualified" | "sale";

// The sale bubble at 0.6s is what fires the beam (beam/pill delays below match it).
const BUBBLES: { key: string; kind: Kind; dx: number; delay: number; still?: boolean }[] = [
  { key: "t1", kind: "trash", dx: TRASH, delay: 0, still: true },
  { key: "s1", kind: "sale", dx: SALE, delay: 0.6, still: true },
  { key: "q1", kind: "qualified", dx: QUALIFIED, delay: 1.2, still: true },
  { key: "t2", kind: "trash", dx: TRASH, delay: 2.4 },
  { key: "q2", kind: "qualified", dx: QUALIFIED, delay: 3.4 },
  { key: "t3", kind: "trash", dx: TRASH, delay: 4.4 },
];

const BUBBLE_STYLE: Record<Kind, string> = {
  trash: "bg-white/10 text-white/55 line-through decoration-white/40",
  qualified: "bg-brand-aqua/20 text-white border border-brand-aqua/50",
  sale: "text-white shadow-[0_0_24px_hsl(var(--brand-pink)/0.6)] [background:var(--gradient-primary)]",
};

const BINS: { kind: Kind; x: number; icon: typeof Trash2; className: string; pulse: string; delay: number }[] = [
  { kind: "trash", x: TRASH, icon: Trash2, className: "bg-white/[0.04] border-white/10 text-white/60", pulse: "hsl(0 0% 100% / 0.2)", delay: 0 },
  { kind: "qualified", x: QUALIFIED, icon: BadgeCheck, className: "bg-brand-aqua/10 border-brand-aqua/40 text-brand-aqua", pulse: "hsl(var(--brand-aqua) / 0.45)", delay: 1.2 },
  { kind: "sale", x: SALE, icon: ShoppingBag, className: "border-transparent text-white [background:var(--gradient-primary)]", pulse: "hsl(var(--brand-pink) / 0.55)", delay: 0.6 },
];

const BEAM_TO_META = "M330 398 C 398 360 404 140 290 52";
const BEAM_TO_TIKTOK = "M330 398 C 420 330 420 0 160 50";

export function HeroFunnel() {
  const { t } = useTranslation("landing");

  return (
    // Fixed LTR geometry so the diagram reads the same in Arabic; text inside still renders RTL.
    <div dir="ltr" role="img" aria-label={t("stage.aria")} className="lp-stage w-full max-w-[460px] mx-auto select-none">
      <svg viewBox="0 0 400 500" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="lp-funnel-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--brand-pink))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(var(--brand-orange))" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="lp-funnel-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--brand-pink))" />
            <stop offset="100%" stopColor="hsl(var(--brand-orange))" />
          </linearGradient>
          <linearGradient id="lp-beam" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--brand-orange))" />
            <stop offset="100%" stopColor="hsl(var(--brand-pink))" />
          </linearGradient>
          <clipPath id="lp-funnel-clip">
            <path d="M60 150 L340 150 L222 290 L222 316 L178 316 L178 290 Z" />
          </clipPath>
        </defs>

        {/* Funnel */}
        <path
          d="M60 150 L340 150 L222 290 L222 316 L178 316 L178 290 Z"
          fill="url(#lp-funnel-fill)"
          stroke="url(#lp-funnel-stroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <ellipse cx="200" cy="150" rx="140" ry="10" fill="none" stroke="url(#lp-funnel-stroke)" strokeOpacity="0.6" strokeWidth="1" />
        <g clipPath="url(#lp-funnel-clip)">
          <rect className="lp-scan" x="40" y="150" width="320" height="2" fill="hsl(var(--brand-aqua))" />
        </g>

        {/* Signal tracks + travelling beams */}
        {[BEAM_TO_META, BEAM_TO_TIKTOK].map((d) => (
          <g key={d}>
            <path d={d} pathLength={100} fill="none" stroke="white" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="0.8 1.6" />
            <path
              d={d}
              pathLength={100}
              fill="none"
              stroke="url(#lp-beam)"
              strokeWidth="3"
              strokeLinecap="round"
              className="lp-beam"
              style={{ animationDelay: "0.6s", filter: "drop-shadow(0 0 6px hsl(var(--brand-pink)))" }}
            />
          </g>
        ))}
      </svg>

      {/* Ad platforms */}
      {[
        { x: 130, name: t("stage.tiktok"), api: t("stage.eventsApi"), dot: "bg-brand-aqua shadow-[3px_0_0_hsl(var(--brand-pink))]" },
        { x: 270, name: t("stage.meta"), api: t("stage.conversionsApi"), dot: "bg-brand-blue" },
      ].map((p) => (
        <div
          key={p.x}
          className="lp-at lp-pill-flash flex items-center gap-[1.5cqw] rounded-full border border-white/15 bg-white/[0.07] px-[3cqw] py-[1.4cqw] backdrop-blur-md"
          style={{ ...at(p.x, 34), animationDelay: "0.6s" }}
        >
          <span className={cn("h-[2.2cqw] w-[2.2cqw] rounded-full", p.dot)} />
          <span className="leading-none">
            <span className="block font-display text-[3.2cqw] font-semibold text-white">{p.name}</span>
            <span className="block text-[2.3cqw] text-white/50 mt-[0.6cqw]">{p.api}</span>
          </span>
        </div>
      ))}

      <div className="lp-at rounded-full border border-brand-aqua/30 bg-brand-aqua/10 px-[2.4cqw] py-[0.8cqw] text-[2.6cqw] text-brand-aqua whitespace-nowrap" style={at(200, 98)}>
        <span dir="auto">{t("stage.clicks")}</span>
      </div>

      {CLICKS.map(([sx, sy, ex, ey, delay], i) => (
        <span
          key={i}
          className="lp-click"
          style={{ "--sx": sx, "--sy": sy, "--ex": ex, "--ey": ey, animationDelay: `${delay}s` } as CSSProperties}
        />
      ))}

      <div className="lp-at rounded-full bg-black/50 border border-white/10 px-[2.4cqw] py-[0.9cqw] text-[2.6cqw] font-medium text-white/85 whitespace-nowrap backdrop-blur" style={at(200, 206)}>
        <span dir="auto">{t("stage.reads")}</span>
      </div>

      <div className="lp-at flex items-center gap-[1cqw] rounded-full border border-brand-pink/40 bg-brand-pink/10 px-[2cqw] py-[0.8cqw] text-[2.4cqw] text-brand-pink whitespace-nowrap" style={at(338, 232)}>
        <Zap className="h-[2.6cqw] w-[2.6cqw]" />
        <span dir="auto">{t("stage.signal")}</span>
      </div>

      {/* Chats being sorted */}
      {BUBBLES.map((b) => (
        <div
          key={b.key}
          data-still={b.still ? "" : undefined}
          className={cn("lp-bubble rounded-[2.4cqw] rounded-bl-[0.6cqw] px-[2.4cqw] py-[1.2cqw] text-[2.9cqw] font-medium", BUBBLE_STYLE[b.kind])}
          style={{ "--dx": b.dx, animationDelay: `${b.delay}s` } as CSSProperties}
        >
          <span dir="auto">{t(`stage.bubbles.${b.key}`)}</span>
        </div>
      ))}

      {/* Bins */}
      {BINS.map(({ kind, x, icon: Icon, className, pulse, delay }) => (
        <div
          key={kind}
          className={cn(
            "lp-at lp-bin-pulse flex w-[29cqw] flex-col items-center gap-[1.2cqw] rounded-[3cqw] border py-[3.2cqw]",
            className,
          )}
          style={{ ...at(x, 444), "--pulse": pulse, animationDelay: `${delay}s` } as CSSProperties}
        >
          <Icon className="h-[5cqw] w-[5cqw]" />
          <span dir="auto" className="font-display text-[2.9cqw] font-semibold uppercase tracking-wide">
            {t(`stage.bins.${kind}`)}
          </span>
        </div>
      ))}
    </div>
  );
}
