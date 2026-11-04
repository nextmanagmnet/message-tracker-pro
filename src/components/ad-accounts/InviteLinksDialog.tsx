import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { whatsappLink } from "@/lib/join";
import type { InviteLink } from "./types";

export function InviteLinksDialog({
  links,
  agencyName,
  onClose,
}: {
  links: InviteLink[] | null;
  agencyName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("agencylinks");

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <Dialog open={!!links} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.intro")}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {(links ?? []).map((l) => (
            <li key={l.advertiserId} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{l.name}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground" dir="ltr">
                {l.url}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(l.url, t("invite.copied"))}>
                  <Copy className="h-4 w-4" /> {t("invite.copy")}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={whatsappLink(t("invite.message", { agency: agencyName, url: l.url }))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" /> {t("invite.whatsapp")}
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">{t("invite.note")}</p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => copy((links ?? []).map((l) => `${l.name}: ${l.url}`).join("\n"), t("invite.copiedAll"))}
          >
            <Copy className="h-4 w-4" /> {t("invite.copyAll")}
          </Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
