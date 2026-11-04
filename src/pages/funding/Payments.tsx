import { useOutletContext } from "react-router-dom";
import { WalletsPanel } from "@/components/funding/WalletsPanel";
import type { FundingContext } from "../Funding";

/** Crediting a user's wallet when their payment arrives. Fees and payment instructions are in Settings. */
export default function Payments() {
  const { agencyId } = useOutletContext<FundingContext>();
  return <WalletsPanel agencyId={agencyId} />;
}
