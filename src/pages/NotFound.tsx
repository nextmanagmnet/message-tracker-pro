import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand/Logo";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="dark flex min-h-screen items-center justify-center wob-mesh-cool p-6 text-foreground">
      <div className="text-center">
        <Logo variant="mark" onDark className="h-16 mx-auto mb-8" />
        <h1 className="mb-4 text-6xl font-bold text-white">{t("notFound.title")}</h1>
        <p className="mb-8 text-lg text-white/75">{t("notFound.message")}</p>
        <Link to="/" className="text-brand-coral underline underline-offset-4 hover:opacity-90">
          {t("notFound.home")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
