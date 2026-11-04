import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "@/components/leads/shared";

export type WalletInfo = {
  currency: string;
  balance: number;
  referenceCode: string;
  fundingAgencyId: string | null;
  settings: {
    commissionPercent: number;
    flatFee: number;
    minTopup: number;
    paymentInstructions: string | null;
  } | null;
};

/** The client's wallet from the wallet function; info is null while loading, failed is set if it could not be read. */
export function useWallet(clientId: string | undefined) {
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!clientId) return;
    try {
      setInfo(await invokeFn<WalletInfo>("wallet", { action: "info", clientId }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [clientId]);

  useEffect(() => {
    setInfo(null);
    void reload();
  }, [reload]);

  return { info, failed, reload };
}
