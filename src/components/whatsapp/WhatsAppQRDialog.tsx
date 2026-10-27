import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface WhatsAppQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess: () => void;
}

type Step = "loading" | "qr" | "connected" | "error";

const POLL_MS = 3000;

export function WhatsAppQRDialog({
  open,
  onOpenChange,
  clientId,
  onSuccess,
}: WhatsAppQRDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : "";
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const poll = async () => {
    try {
      const authHeader = await getAuthHeader();
      const res = await supabase.functions.invoke("whatsapp-qr", {
        body: { action: "status", clientId },
        headers: { Authorization: authHeader },
      });
      if (res.error) throw new Error(res.error.message || "Failed to check status");

      if (res.data?.state === "connected") {
        stopPolling();
        setStep("connected");
        onSuccess();
        setTimeout(() => onOpenChange(false), 1500);
        return;
      }
      if (res.data?.qr) setQr(res.data.qr);
    } catch (err) {
      console.error("QR status error:", err);
      // Transient errors during polling shouldn't kill the dialog — keep trying.
    }
  };

  const start = async () => {
    setStep("loading");
    setError(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await supabase.functions.invoke("whatsapp-qr", {
        body: { action: "start", clientId },
        headers: { Authorization: authHeader },
      });
      if (res.error) throw new Error(res.error.message || "Failed to start WhatsApp connection");
      if (!res.data?.qr) throw new Error("No QR code returned");

      setQr(res.data.qr);
      setStep("qr");
      stopPolling();
      pollRef.current = setInterval(poll, POLL_MS);
    } catch (err) {
      console.error("QR start error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("error");
    }
  };

  useEffect(() => {
    if (open) {
      start();
    } else {
      stopPolling();
      setStep("loading");
      setQr(null);
      setError(null);
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect WhatsApp</DialogTitle>
          <DialogDescription>
            Scan this code with the WhatsApp app on the phone whose number you want to connect.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col items-center justify-center py-4 gap-4">
          {step === "loading" && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating QR code…</p>
            </>
          )}

          {step === "qr" && qr && (
            <>
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="WhatsApp QR code"
                className="w-56 h-56 rounded-lg border border-border"
              />
              <p className="text-sm text-muted-foreground text-center">
                Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device, then scan.
                The code refreshes automatically if it expires.
              </p>
            </>
          )}

          {step === "connected" && (
            <>
              <div className="p-3 rounded-full bg-success/10">
                <Check className="w-8 h-8 text-success" />
              </div>
              <p className="text-sm text-success">WhatsApp connected!</p>
            </>
          )}

          {step === "error" && (
            <>
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button variant="outline" onClick={start}>
                Try Again
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
