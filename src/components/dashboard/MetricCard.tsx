import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  hint?: string;
  icon: ReactNode;
  trend?: "up" | "down" | "neutral";
}

const TREND = {
  up: { Icon: TrendingUp, color: "text-success" },
  down: { Icon: TrendingDown, color: "text-destructive" },
  neutral: { Icon: Minus, color: "text-muted-foreground" },
};

export const MetricCard = ({ title, value, change, changeLabel, hint, icon, trend = "neutral" }: MetricCardProps) => {
  const { t } = useTranslation("features");
  const { Icon, color } = TREND[trend];

  return (
    <div className="metric-card group">
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">{icon}</div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${color}`}>
            <Icon className="w-3 h-3" />
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <p className="stat-value">{value}</p>
      {(hint || change !== undefined) && (
        <p className="text-xs text-muted-foreground mt-2">{hint ?? changeLabel ?? t("common.vsLastPeriod")}</p>
      )}
    </div>
  );
};
