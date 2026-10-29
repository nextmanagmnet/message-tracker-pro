import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useTranslation } from "react-i18next";

export type ChartPoint = { date: string; real: number; qualified: number; clients: number; trash: number };

const SERIES = [
  { key: "real", color: "hsl(var(--chart-2))" },
  { key: "qualified", color: "hsl(var(--chart-3))" },
  { key: "clients", color: "hsl(var(--success))" },
  { key: "trash", color: "hsl(var(--destructive))" },
] as const;

export const ConversionChart = ({ data }: { data: ChartPoint[] }) => {
  const { t, i18n } = useTranslation("features");
  const empty = data.every((d) => d.real === 0 && d.trash === 0);
  return (
    <div className="glass-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t("chart.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("chart.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
            <span className="text-sm text-muted-foreground">{t(`chart.${s.key}`)}</span>
          </div>
        ))}
      </div>

      <div className="h-[300px] relative" dir="ltr">
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-sm text-muted-foreground">{t("chart.empty")}</p>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} reversed={i18n.dir() === "rtl"} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} orientation={i18n.dir() === "rtl" ? "right" : "left"} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            {SERIES.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={t(`chart.${s.key}`)} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
