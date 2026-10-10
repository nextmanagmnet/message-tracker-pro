import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type ChartPoint = { date: string; real: number; trash: number };

export const ConversionChart = ({ data }: { data: ChartPoint[] }) => {
  const empty = data.every((d) => d.real === 0 && d.trash === 0);
  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Conversion Trends</h3>
        <p className="text-sm text-muted-foreground">Real vs trash conversations per day</p>
      </div>

      <div className="flex items-center gap-6 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">Real Conversations</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <span className="text-sm text-muted-foreground">Trash</span>
        </div>
      </div>

      <div className="h-[300px] relative">
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-sm text-muted-foreground">No conversations in this period yet</p>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorTrash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Area type="monotone" dataKey="real" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorReal)" />
            <Area type="monotone" dataKey="trash" stroke="hsl(var(--destructive))" strokeWidth={2} fillOpacity={1} fill="url(#colorTrash)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
