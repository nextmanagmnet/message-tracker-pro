import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, invokeFn, LimitError } from "@/components/leads/shared";

type Result = { imported: number; skipped: number; found: number };

const KEY = (clientId: string) => `wob-catalog-site-${clientId}`;
const remembered = (clientId: string) => {
  try {
    return localStorage.getItem(KEY(clientId)) ?? "";
  } catch {
    return "";
  }
};

/** Pulls the products from the business's own website into the catalog (pictures included). */
export function ImportDialog({
  clientId,
  open,
  onClose,
  onDone,
}: {
  clientId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("features");
  const [url, setUrl] = useState(() => remembered(clientId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await invokeFn<Result>("catalog-import", { clientId, url: url.trim() });
      try {
        localStorage.setItem(KEY(clientId), url.trim());
      } catch {
        // remembering the address is a convenience only
      }
      toast.success(
        r.imported === 0
          ? t("catalog.import.nothingNew", { found: r.found })
          : t("catalog.import.done", { count: r.imported }) +
              (r.skipped ? ` ${t("catalog.import.skipped", { count: r.skipped })}` : ""),
      );
      onDone();
      onClose();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : e instanceof LimitError ? "limit" : undefined;
      setError(
        code === "none_found" || code === "bad_url"
          ? t(`catalog.import.${code}`)
          : code === "limit" && e instanceof Error
            ? e.message
            : t("catalog.import.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" aria-hidden /> {t("catalog.import.title")}
          </DialogTitle>
          <DialogDescription>{t("catalog.import.hint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="site-url">{t("catalog.import.url")}</Label>
          <Input
            id="site-url"
            dir="ltr"
            inputMode="url"
            placeholder="myshop.com"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && <p className="text-sm text-muted-foreground">{t("catalog.import.working")}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("catalog.cancel")}
          </Button>
          <Button variant="glow" onClick={run} disabled={busy || !url.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("catalog.import.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
