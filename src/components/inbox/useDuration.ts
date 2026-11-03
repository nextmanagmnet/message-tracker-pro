import { useTranslation } from "react-i18next";

/** Short localized duration: "12 min", "3 hr", "2 days". */
export function useDuration() {
  const { i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-SA" : "en-US";
  return (msValue: number) => {
    const mins = Math.max(0, Math.round(msValue / 60_000));
    const [value, unit] = mins < 60 ? [mins, "minute"] : mins < 1440 ? [mins / 60, "hour"] : [mins / 1440, "day"];
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);
  };
}
