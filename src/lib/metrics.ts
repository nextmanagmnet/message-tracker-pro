export type LeadLite = { status: "verified" | "pending" | "trash"; client_id?: string | null };

export type ClientStats = {
  total: number;
  real: number;
  pending: number;
  trash: number;
  spend: number;
  costPerReal: number | null;
  realRate: number;
  trashRatio: number;
};

/** Only "verified" leads count as real conversations; cost is spend / real. */
export function computeStats(leads: LeadLite[], spend: number): ClientStats {
  const real = leads.filter((l) => l.status === "verified").length;
  const pending = leads.filter((l) => l.status === "pending").length;
  const trash = leads.filter((l) => l.status === "trash").length;
  const total = leads.length;
  return {
    total,
    real,
    pending,
    trash,
    spend,
    costPerReal: real > 0 ? spend / real : null,
    realRate: total > 0 ? (real / total) * 100 : 0,
    trashRatio: total > 0 ? (trash / total) * 100 : 0,
  };
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
