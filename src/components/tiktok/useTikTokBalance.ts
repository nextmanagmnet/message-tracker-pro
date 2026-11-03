import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "@/components/leads/shared";

export type AdBalance = {
  advertiserId: string;
  name: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  underBusinessCenter: boolean;
  error: "reconnect" | "unavailable" | null;
};

// Live ad account balances for a client. Refreshes quietly every 2 minutes; null while the first load runs.
export function useTikTokBalance(clientId: string | undefined) {
  const [accounts, setAccounts] = useState<AdBalance[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const d = await invokeFn<{ accounts: AdBalance[] }>("tiktok-oauth", { action: "balance", clientId });
      setAccounts(d.accounts);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [clientId]);

  useEffect(() => {
    setAccounts(null);
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  return { accounts, failed, reload: load };
}
