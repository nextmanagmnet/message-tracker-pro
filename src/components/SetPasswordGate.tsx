import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// Invited clients arrive signed in through the invite link without a password; make them pick one first.
export function SetPasswordGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("features");
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // A password-reset link signs the person in; ask for the new password right away.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setDone(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!(user?.user_metadata?.needs_password || recovering) || done) return <>{children}</>;

  const save = async () => {
    if (password.length < 8) return toast.error(t("invite.tooShort"));
    if (password !== confirm) return toast.error(t("invite.mismatch"));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password, data: { needs_password: false } });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background wob-mesh-hero p-4">
      <div className="glass-card w-full max-w-md space-y-4 p-8">
        <Logo variant="horizontal" className="h-10" />
        <h1 className="text-xl font-semibold text-foreground">{t("invite.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("invite.hint", { email: user.email })}</p>
        <div className="space-y-1.5">
          <Label htmlFor="pw">{t("invite.password")}</Label>
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">{t("invite.confirm")}</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && save()} />
        </div>
        <Button variant="glow" className="w-full" onClick={save} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("invite.save")}
        </Button>
      </div>
    </div>
  );
}
