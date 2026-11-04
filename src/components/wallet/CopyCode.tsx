import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyCode({ code }: { code: string }) {
  const { t } = useTranslation("wallet");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen and selectable.
    }
  };
  return (
    <div className="flex items-center gap-2">
      <code className="rounded-md bg-secondary px-3 py-1.5 font-mono text-lg font-semibold tracking-wider" dir="ltr">
        {code}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </Button>
    </div>
  );
}
