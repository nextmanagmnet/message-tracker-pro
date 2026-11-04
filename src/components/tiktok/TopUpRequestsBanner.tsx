import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/hooks/useAgency";

// Tells the agency that clients are waiting for a top-up approval. Only for staff who can approve in Funding.
export function TopUpRequestsBanner({ className }: { className?: string }) {
  const { t } = useTranslation("topup");
  const { agency, can, isIndividual, isClientUser } = useAgency();
  const canManage = can("funding");
  const [count, setCount] = useState(0);
  const eligible = canManage && !isIndividual && !isClientUser && !!agency?.id;

  useEffect(() => {
    if (!eligible || !agency?.id) return;
    let cancelled = false;
    const load = () =>
      supabase
        .from("topup_requests")
        .select("id", { count: "exact", head: true })
        .eq("funding_agency_id", agency.id)
        .eq("status", "pending")
        .then(({ count: n }) => {
          if (!cancelled) setCount(n ?? 0);
        });
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eligible, agency?.id]);

  if (!eligible || count === 0) return null;
  return (
    <Link
      to="/funding"
      className={`flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground hover:bg-warning/15 ${className ?? ""}`}
    >
      <Bell className="w-5 h-5 shrink-0 text-warning" />
      <span className="flex-1">{t("banner", { count })}</span>
      <span className="text-primary underline">{t("review")}</span>
    </Link>
  );
}
