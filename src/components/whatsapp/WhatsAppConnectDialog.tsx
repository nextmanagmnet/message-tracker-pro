import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, Phone, Building2, AlertCircle } from "lucide-react";

interface Waba {
  id: string;
  name: string;
  businessId: string;
  businessName: string;
  status: string;
}

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  platformType: string;
}

interface WhatsAppConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess: () => void;
}

type Step = "loading" | "select-waba" | "select-numbers" | "importing" | "done" | "error";

export function WhatsAppConnectDialog({
  open,
  onOpenChange,
  clientId,
  onSuccess,
}: WhatsAppConnectDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [wabas, setWabas] = useState<Waba[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<Waba | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      validateAndFetchWabas();
    } else {
      // Reset state when closed
      setStep("loading");
      setError(null);
      setWabas([]);
      setSelectedWaba(null);
      setPhoneNumbers([]);
      setSelectedPhones(new Set());
    }
  }, [open, clientId]);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token
      ? `Bearer ${session.access_token}`
      : "";
  };

  const validateAndFetchWabas = async () => {
    setStep("loading");
    setError(null);

    try {
      const authHeader = await getAuthHeader();
      
      // First validate token
      const validateRes = await supabase.functions.invoke("whatsapp-connect", {
        body: { action: "validate-token", clientId },
        headers: { Authorization: authHeader },
      });

      if (validateRes.error) {
        throw new Error(validateRes.error.message || "Failed to validate token");
      }

      if (!validateRes.data?.valid) {
        throw new Error(validateRes.data?.error || "WhatsApp token is invalid");
      }

      // Fetch WABAs
      const wabasRes = await supabase.functions.invoke("whatsapp-connect", {
        body: { action: "fetch-wabas", clientId },
        headers: { Authorization: authHeader },
      });

      if (wabasRes.error) {
        throw new Error(wabasRes.error.message || "Failed to fetch WABAs");
      }

      if (!wabasRes.data?.wabas || wabasRes.data.wabas.length === 0) {
        throw new Error("No WhatsApp Business Accounts found. Make sure your token has access to a WABA.");
      }

      setWabas(wabasRes.data.wabas);
      setStep("select-waba");
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An error occurred");
      setStep("error");
    }
  };

  const fetchPhoneNumbers = async (waba: Waba) => {
    setSelectedWaba(waba);
    setStep("loading");

    try {
      const authHeader = await getAuthHeader();
      
      const res = await supabase.functions.invoke("whatsapp-connect", {
        body: { action: "fetch-phone-numbers", clientId, wabaId: waba.id },
        headers: { Authorization: authHeader },
      });

      if (res.error) {
        throw new Error(res.error.message || "Failed to fetch phone numbers");
      }

      if (!res.data?.phoneNumbers || res.data.phoneNumbers.length === 0) {
        throw new Error("No phone numbers found in this WABA.");
      }

      setPhoneNumbers(res.data.phoneNumbers);
      // Auto-select all by default
      setSelectedPhones(new Set(res.data.phoneNumbers.map((p: PhoneNumber) => p.id)));
      setStep("select-numbers");
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An error occurred");
      setStep("error");
    }
  };

  const importNumbers = async () => {
    if (selectedPhones.size === 0 || !selectedWaba) return;

    setStep("importing");

    try {
      const authHeader = await getAuthHeader();
      
      const numbersToImport = phoneNumbers
        .filter((p) => selectedPhones.has(p.id))
        .map((p) => ({
          phoneNumberId: p.id,
          displayPhoneNumber: p.phoneNumber,
        }));

      const res = await supabase.functions.invoke("whatsapp-connect", {
        body: {
          action: "import-numbers",
          clientId,
          wabaId: selectedWaba.id,
          phoneNumbers: numbersToImport,
        },
        headers: { Authorization: authHeader },
      });

      if (res.error) {
        throw new Error(res.error.message || "Failed to import numbers");
      }

      const { imported, failed } = res.data;

      if (failed && failed.length > 0) {
        toast.warning(`Imported ${imported.length} numbers, ${failed.length} failed`);
      } else {
        toast.success(`Successfully imported ${imported.length} WhatsApp number(s)`);
      }

      setStep("done");
      onSuccess();
      
      // Close after a brief delay
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An error occurred");
      setStep("error");
    }
  };

  const togglePhone = (phoneId: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phoneId)) {
        next.delete(phoneId);
      } else {
        next.add(phoneId);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-success" />
            Connect WhatsApp Numbers
          </DialogTitle>
          <DialogDescription>
            Import phone numbers from your WhatsApp Business Account
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button variant="outline" onClick={validateAndFetchWabas}>
                Try Again
              </Button>
            </div>
          )}

          {step === "select-waba" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a WhatsApp Business Account:
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {wabas.map((waba) => (
                  <button
                    key={waba.id}
                    onClick={() => fetchPhoneNumbers(waba)}
                    className="w-full p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/50 transition-all text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {waba.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {waba.businessName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          ID: {waba.id}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "select-numbers" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Select phone numbers to import:
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("select-waba")}
                >
                  Change WABA
                </Button>
              </div>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {phoneNumbers.map((phone) => (
                  <label
                    key={phone.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedPhones.has(phone.id)}
                      onCheckedChange={() => togglePhone(phone.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">
                        {phone.phoneNumber}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {phone.verifiedName || "Not verified"}
                      </p>
                    </div>
                    {phone.qualityRating && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          phone.qualityRating === "GREEN"
                            ? "bg-success/10 text-success"
                            : phone.qualityRating === "YELLOW"
                            ? "bg-warning/10 text-warning"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {phone.qualityRating}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <Button
                className="w-full"
                disabled={selectedPhones.size === 0}
                onClick={importNumbers}
              >
                Import {selectedPhones.size} Number{selectedPhones.size !== 1 ? "s" : ""}
              </Button>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importing numbers...</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="p-3 rounded-full bg-success/10">
                <Check className="w-8 h-8 text-success" />
              </div>
              <p className="text-sm text-success">Numbers imported successfully!</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
