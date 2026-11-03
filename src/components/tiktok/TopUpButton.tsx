import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/hooks/useAgency";
import { ADS_MANAGER_URL, TOP_UP_HELP_URL, topUpRoute } from "@/lib/topUp";
import { TopUpRequest } from "./TopUpRequest";

// Agency staff with a connected Business Center fund from WOB (/funding); everyone else gets the exact steps in
// TikTok. Never a dead link: individuals and client users can't open /funding.
export function TopUpButton({
  advertiserId,
  underBusinessCenter = false,
  variant = "outline",
  size = "sm",
}: {
  advertiserId: string;
  underBusinessCenter?: boolean;
  variant?: "outline" | "glow" | "default";
  size?: "sm" | "default";
}) {
  const { t } = useTranslation("features");
  const { t: tt } = useTranslation("topup");
  const navigate = useNavigate();
  const { agency, selectedClient, canManage, isIndividual, isClientUser } = useAgency();
  const [hasBc, setHasBc] = useState(false);
  const [open, setOpen] = useState(false);
  const [routed, setRouted] = useState(false);

  const isAgencyStaff = !isIndividual && !isClientUser;
  useEffect(() => {
    if (!isAgencyStaff || !canManage || !agency?.id) return;
    let cancelled = false;
    supabase
      .from("bc_connections")
      .select("id")
      .eq("agency_id", agency.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setHasBc(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [isAgencyStaff, canManage, agency?.id]);

  const route = topUpRoute({ isAgencyStaff, canManage, hasBusinessCenter: hasBc });
  const click = () => (route === "funding" ? navigate(`/funding?advertiser=${advertiserId}`) : setOpen(true));

  return (
    <>
      <Button variant={variant} size={size} onClick={click}>
        <Wallet className="w-4 h-4" /> {t("balance.topUp")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("balance.howTitle")}</DialogTitle>
            <DialogDescription>{underBusinessCenter ? t("balance.howBc") : t("balance.howDirect")}</DialogDescription>
          </DialogHeader>
          {selectedClient && (
            <TopUpRequest clientId={selectedClient.id} advertiserId={advertiserId} onRouted={setRouted} />
          )}
          {routed && <p className="text-sm font-medium text-foreground">{tt("orSelf")}</p>}
          <ol className="list-decimal space-y-2 ps-5 text-sm text-foreground">
            <li>{t("balance.step1")}</li>
            <li>{underBusinessCenter ? t("balance.step2Bc") : t("balance.step2")}</li>
            <li>{t("balance.step3")}</li>
          </ol>
          <p className="text-xs text-muted-foreground">{t("balance.delay")}</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" asChild>
              <a href={TOP_UP_HELP_URL} target="_blank" rel="noreferrer">
                {t("balance.help")}
              </a>
            </Button>
            <Button asChild>
              <a href={ADS_MANAGER_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4" /> {t("balance.openTikTok")}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
