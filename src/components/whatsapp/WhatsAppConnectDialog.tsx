import { useState, useEffect, useRef } from "react";
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
import { Loader2, Check, Phone, AlertCircle, Smartphone } from "lucide-react";

interface WhatsAppConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess: () => void;
}

type Step = "loading" | "qr" | "done" | "error";

export function WhatsAppConnectDialog({ open, onOpenChange, clientId, onSuccess }: WhatsAppConnectDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const instance = useRef<string | null>(null);

  const stopPolling = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const call = async (action: string) => {
    const res = await supabase.functions.invoke("whatsapp-connect", {
      body: { action, clientId, instance: instance.current },
    });
    if (res.error) throw new Error(res.error.message);
    if (res.data?.instance) instance.current = res.data.instance;
    return res.data;
  };

  const checkStatus = async () => {
    try {
      const d = await call("qr-status");
      if (d?.error) throw new Error(d.error);
      if (d?.state === "connected") {
        stopPolling();
        setPhone(d.phoneNumber);
        setStep("done");
        toast.success(`Connected ${d.phoneNumber}`);
        onSuccess();
        setTimeout(() => onOpenChange(false), 1800);
      } else if (d?.qr) {
        setQr(d.qr);
      }
    } catch (e: any) {
      stopPolling();
      setError(e.message || "Connection failed");
      setStep("error");
    }
  };

  const start = async () => {
    stopPolling();
    setStep("loading");
    setError(null);
    try {
      const d = await call("qr-start");
      if (d?.error && d?.state !== "authorized") throw new Error(d.error);
      if (d?.state === "authorized") {
        await checkStatus();
        return;
      }
      setQr(d.qr);
      setStep("qr");
      timer.current = window.setInterval(checkStatus, 3000);
    } catch (e: any) {
      setError(e.message || "Could not load the QR code");
      setStep("error");
    }
  };

  useEffect(() => {
    if (open) start();
    else {
      stopPolling();
      setQr(null);
      setPhone(null);
      instance.current = null;
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-success" />
            Connect WhatsApp
          </DialogTitle>
          <DialogDescription>Scan the code with the phone that has this client's WhatsApp.</DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Preparing QR code...</p>
          </div>
        )}

        {step === "qr" && qr && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-xl bg-foreground p-3">
              <img src={`data:image/png;base64,${qr}`} alt="WhatsApp QR code" className="w-60 h-60" />
            </div>
            <ol className="text-sm text-muted-foreground space-y-1 self-stretch">
              <li>1. Open WhatsApp on the phone</li>
              <li>2. Tap Settings (or ⋮) → <span className="text-foreground">Linked devices</span></li>
              <li>3. Tap <span className="text-foreground">Link a device</span> and scan this code</li>
            </ol>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Smartphone className="w-3.5 h-3.5" /> Waiting for scan… the code refreshes automatically
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center py-6 gap-4">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <p className="text-sm text-destructive text-center">{error}</p>
            <Button variant="outline" onClick={start}>Try Again</Button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-success/10">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="text-sm text-success">{phone} is connected!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
