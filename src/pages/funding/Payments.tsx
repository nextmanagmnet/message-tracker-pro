import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { PaymentsRegister } from "@/components/funding/PaymentsRegister";
import { WalletsPanel } from "@/components/funding/WalletsPanel";
import type { FundingContext } from "../Funding";

/** Crediting a user's wallet when their payment arrives, and the register of everything recorded. */
export default function Payments() {
  const { agencyId } = useOutletContext<FundingContext>();
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      <WalletsPanel agencyId={agencyId} onRecorded={() => setRefreshKey((k) => k + 1)} />
      <PaymentsRegister agencyId={agencyId} refreshKey={refreshKey} />
    </div>
  );
}
