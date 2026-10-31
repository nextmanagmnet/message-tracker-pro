import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mail, Lock, User, Building, Check, Building2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher, ThemeToggle } from "@/components/brand/PreferenceControls";
import type { AccountType } from "@/hooks/useAgency";
import { cn } from "@/lib/utils";

// First-time users (no WhatsApp number connected yet) go through onboarding.
async function landingPath(): Promise<string> {
  const { count, error } = await supabase
    .from("whatsapp_numbers")
    .select("id", { count: "exact", head: true });
  return !error && (count ?? 0) === 0 ? "/onboarding" : "/";
}

const Auth = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("individual");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    companyName: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
        toast.success(t("auth.welcomeToast"));
        navigate(await landingPath());
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            data: {
              full_name: formData.fullName,
              company_name: formData.companyName,
              account_type: accountType,
            },
          },
        });
        if (error) throw error;

        if (data.session) {
          toast.success(t("auth.createdToast"));
          navigate("/onboarding");
        } else {
          // Email confirmation is on: no session until the link is clicked.
          toast.success(t("auth.checkEmail"));
          setIsLogin(true);
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      const msg = error instanceof Error ? error.message : "";
      setNeedsConfirm(/not confirmed/i.test(msg));
      if (/not confirmed/i.test(msg)) toast.error(t("auth.notConfirmed"));
      else if (/invalid login credentials/i.test(msg)) toast.error(t("auth.badLogin"));
      else toast.error(msg || t("auth.failed"));
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!formData.email.trim()) return toast.error(t("auth.enterEmailFirst"));
    const { error } = await supabase.auth.resetPasswordForEmail(formData.email.trim(), { redirectTo: `${window.location.origin}/` });
    if (error) toast.error(error.message);
    else toast.success(t("auth.resetSent"));
  };

  const resendConfirmation = async () => {
    if (!formData.email.trim()) return toast.error(t("auth.enterEmailFirst"));
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: formData.email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) toast.error(error.message);
    else toast.success(t("auth.resendSent"));
  };

  const typeOptions: { value: AccountType; icon: typeof User; title: string; desc: string }[] = [
    { value: "individual", icon: UserRound, title: t("auth.individual"), desc: t("auth.individualDesc") },
    { value: "agency", icon: Building2, title: t("auth.agency"), desc: t("auth.agencyDesc") },
  ];

  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-2">
      {/* Brand hero — mesh gradient is reserved for moments like this */}
      <aside className="dark relative hidden lg:flex flex-col justify-between wob-mesh-hero p-12 text-white overflow-hidden">
        <Logo variant="horizontal" onDark className="h-14" />
        <div className="max-w-lg">
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">{t("auth.heroTitle")}</h1>
          <p className="text-white/75 text-lg mb-8">{t("auth.heroSubtitle")}</p>
          <ul className="space-y-3">
            {[t("auth.heroPoint1"), t("auth.heroPoint2"), t("auth.heroPoint3")].map((point) => (
              <li key={point} className="flex items-center gap-3 text-white/90">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs tracking-[0.3em] uppercase text-white/50">{t("app.tagline")}</p>
      </aside>

      <main className="flex flex-col p-4 sm:p-8">
        <div className="flex justify-end gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex justify-center mb-8">
              <Logo variant="stacked" className="h-24" />
            </div>

            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
                {isLogin ? t("auth.welcomeBack") : t("auth.createAccount")}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium mb-2">{t("auth.accountType")}</legend>
                      <div className="grid grid-cols-2 gap-3">
                        {typeOptions.map((opt) => {
                          const selected = accountType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setAccountType(opt.value)}
                              aria-pressed={selected}
                              className={cn(
                                "text-start rounded-xl border p-3 transition-colors",
                                selected
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/40"
                              )}
                            >
                              <opt.icon className={cn("h-5 w-5 mb-2", selected ? "text-primary" : "text-muted-foreground")} />
                              <p className="font-semibold text-sm">{opt.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                      <div className="relative">
                        <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="fullName"
                          type="text"
                          placeholder={t("auth.fullNamePlaceholder")}
                          className="ps-10"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="companyName">
                        {accountType === "agency" ? t("auth.companyNameAgency") : t("auth.companyName")}
                      </Label>
                      <div className="relative">
                        <Building className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="companyName"
                          type="text"
                          placeholder={t("auth.companyPlaceholder")}
                          className="ps-10"
                          value={formData.companyName}
                          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      dir="ltr"
                      placeholder="you@example.com"
                      className="ps-10"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="ps-10"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <Button type="submit" variant="glow" className="w-full" disabled={loading}>
                  {loading ? t("common.pleaseWait") : isLogin ? t("auth.signIn") : t("auth.createAccount")}
                </Button>
              </form>

              {isLogin && (
                <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
                  <button type="button" className="text-primary hover:underline" onClick={forgotPassword}>{t("auth.forgot")}</button>
                  {needsConfirm && (
                    <button type="button" className="text-primary hover:underline" onClick={resendConfirmation}>{t("auth.resend")}</button>
                  )}
                </div>
              )}

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
