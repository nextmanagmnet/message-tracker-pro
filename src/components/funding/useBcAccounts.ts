import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CachedAccount = {
  advertiser_id: string;
  advertiser_name: string | null;
  bc_id: string;
  bc_name: string | null;
  updated_at: string;
};

/**
 * The ad accounts of this agency's Business Centers as last saved by the server. It answers at once, so pages never
 * wait on TikTok just to show names; live balances are fetched separately.
 */
export function useBcAccounts(agencyId: string | undefined) {
  const [accounts, setAccounts] = useState<CachedAccount[] | null>(null);

  const reload = useCallback(async () => {
    if (!agencyId) return;
    const { data } = await supabase
      .from("bc_accounts")
      .select("advertiser_id, advertiser_name, bc_id, bc_name, updated_at")
      .eq("agency_id", agencyId)
      .order("advertiser_name", { ascending: true })
      .limit(5000);
    setAccounts((data ?? []) as CachedAccount[]);
  }, [agencyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byId = useMemo(() => new Map((accounts ?? []).map((a) => [a.advertiser_id, a])), [accounts]);
  /** Business Center name for an ad account; null when unknown, undefined while loading. */
  const bcNameOf = accounts ? (id: string) => byId.get(id)?.bc_name ?? byId.get(id)?.bc_id ?? null : undefined;
  const updatedAt = accounts?.length ? accounts.reduce((m, a) => (a.updated_at > m ? a.updated_at : m), "") : null;

  return { accounts, reload, bcNameOf, updatedAt };
}
