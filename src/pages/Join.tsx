import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher, ThemeToggle } from "@/components/brand/PreferenceControls";
import { invokeFn, ApiError } from "@/components/leads/shared";
import { useAgency } from "@/hooks/useAgency";
import { useAuth } from "@/hooks/useAuth";
import { clearJoinToken, getJoinToken, setJoinToken } from "@/lib/join";

type Preview = { valid: boolean; agencyName?: string; advertiserName?: string };

const Join = () => {
  const { t, i18n } = useTranslation("agencylinks");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { selectedClient, loading: agencyLoading } = useAgency();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Take the token from the URL once, keep it in storage, and drop it from the address bar and history.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("token");
    if (url) {
      setJoinToken(url);
      navigate("/join", { replace: true });
    }
    setToken(url ?? getJoinToken());
  }, [navigate]);

  useEffect(() => {
    if (token === null) return;
    let cancelled = false;
    invokeFn<Preview>("agency-join", { action: "preview", token })
      .then((p) => {
        if (cancelled) return;
        // A dead link must not keep pulling a signed-in user back here from every page.
        if (!p.valid) clearJoinToken();
        setPreview(p);
      })
      .catch(() => {
        if (cancelled) return;
        clearJoinToken();
        setPreview({ valid: false });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    if (!token || !selectedClient) return;
    setAccepting(true);
    try {
      const r = await invokeFn<{ agencyName: string; advertiserName: string }>("agency-join", {
        action: "accept",
        token,
        clientId: selectedClient.id,
      });
      clearJoinToken();
      toast.success(t("join.success", { agency: r.agencyName, account: r.advertiserName }));
      navigate("/connections");
    } catch (e) {
      const key = e instanceof ApiError && e.code ? `join.errors.${e.code}` : "";
      toast.error(
        key && i18n.exists(key, { ns: "agencylinks" }) ? t(key) : e instanceof Error ? e.message : t("common.error"),
      );
      setAccepting(false);
    }
  };

  const goAuth = (mode: "signin" | "signup") => navigate(mode === "signup" ? "/auth?mode=signup" : "/auth");

  const waiting = token === null || preview === null || authLoading || (!!user && agencyLoading);
  const list = (key: string) => t(key, { returnObjects: true }) as string[];

  return (
    <div className="min-h-screen bg-background flex flex-col p-4 sm:p-8">
      <div className="flex justify-end gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <main className="flex-1 flex flex-col items-center justify-center gap-6">
        <Logo variant="stacked" className="h-20" />
        <div className="glass-card w-full max-w-lg p-6 sm:p-8">
          {waiting ? (
            <p className="flex items-center justify-center gap-2 text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("join.checking")}
            </p>
          ) : !preview.valid || !token ? (
            <div className="space-y-4 text-center">
              <h1 className="text-xl font-bold">{t("join.invalidTitle")}</h1>
              <p className="text-sm text-muted-foreground">{t("join.invalidBody")}</p>
              <Button asChild variant="outline">
                <Link to="/">{t("join.home")}</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <h1 className="text-xl font-bold text-center">
                {preview.advertiserName
                  ? t("join.title", { agency: preview.agencyName, account: preview.advertiserName })
                  : t("join.titleNoName", { agency: preview.agencyName })}
              </h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <section>
                  <h2 className="mb-2 text-sm font-semibold">{t("join.canSee")}</h2>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {list("join.canSeeList").map((x) => (
                      <li key={x} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> {x}
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-semibold">{t("join.cannotSee")}</h2>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {list("join.cannotSeeList").map((x) => (
                      <li key={x} className="flex gap-2">
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden /> {x}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground list-disc ps-5">
                <li>{t("join.funds")}</li>
                <li>{t("join.leave")}</li>
              </ul>

              {!user ? (
                <div className="flex flex-col gap-2">
                  <Button variant="glow" onClick={() => goAuth("signup")}>
                    {t("join.create")}
                  </Button>
                  <Button variant="outline" onClick={() => goAuth("signin")}>
                    {t("join.signIn")}
                  </Button>
                </div>
              ) : !selectedClient ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <p className="font-semibold">{t("join.noClientTitle")}</p>
                  <p className="mt-1 text-muted-foreground">{t("join.noClientBody")}</p>
                </div>
              ) : (
                <Button variant="glow" className="w-full" onClick={accept} disabled={accepting}>
                  {accepting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {accepting ? t("join.accepting") : t("join.accept")}
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Join;
