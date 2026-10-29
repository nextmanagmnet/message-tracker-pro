import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Platform, Stage } from "./shared";

const STAGE_STYLE: Record<Stage, string> = {
  new: "bg-muted text-muted-foreground border-border",
  real: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  qualified: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  client: "bg-success/15 text-success border-success/30",
  not_lead: "bg-destructive/10 text-destructive border-destructive/30",
};

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const { t } = useTranslation("features");
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", STAGE_STYLE[stage], className)}>
      {t(`stage.${stage}`)}
    </span>
  );
}

export function PlatformChip({ platform }: { platform: Platform | null }) {
  const { t } = useTranslation("features");
  if (!platform) return <span className="text-xs text-muted-foreground">{t("platform.none")}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        platform === "tiktok" ? "bg-chart-1/15 text-chart-1" : "bg-chart-4/15 text-chart-4"
      )}
    >
      {t(`platform.${platform}`)}
    </span>
  );
}
