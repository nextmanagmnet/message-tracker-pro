import { useTranslation } from "react-i18next";
import { Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLanguage, type Language } from "@/i18n";
import { setTheme, useTheme } from "./theme";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const next: Language = i18n.language === "ar" ? "en" : "ar";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => setLanguage(next)}
      aria-label={next === "ar" ? "العربية" : "English"}
    >
      <Languages className="h-4 w-4" />
      <span>{next === "ar" ? "العربية" : "English"}</span>
    </Button>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={t(next === "dark" ? "theme.dark" : "theme.light")}
      title={t(next === "dark" ? "theme.dark" : "theme.light")}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
