import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { RequestsPanel } from "@/components/funding/RequestsPanel";
import { useBcAccounts } from "@/components/funding/useBcAccounts";
import type { FundingContext } from "../Funding";

/** Top-up requests from users, with one-click approval. */
export default function Requests() {
  const { agencyId } = useOutletContext<FundingContext>();
  const { bcNameOf } = useBcAccounts(agencyId);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <RequestsPanel
      agencyId={agencyId}
      canManage
      reloadKey={reloadKey}
      bcNameOf={bcNameOf}
      onChanged={() => setReloadKey((k) => k + 1)}
    />
  );
}
