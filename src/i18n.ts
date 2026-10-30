import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import arCommon from "./locales/ar/common.json";
import enFeatures from "./locales/en/features.json";
import arFeatures from "./locales/ar/features.json";
import enLanding from "./locales/en/landing.json";
import arLanding from "./locales/ar/landing.json";

export type Language = "en" | "ar";

const LANG_KEY = "wob-lang";

function readSavedLanguage(): Language {
  try {
    return localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

function applyDocumentLanguage(lang: Language) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === "ar" ? "rtl" : "ltr";
}

const initial = readSavedLanguage();
applyDocumentLanguage(initial);

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, features: enFeatures, landing: enLanding },
    ar: { common: arCommon, features: arFeatures, landing: arLanding },
  },
  lng: initial,
  fallbackLng: "en",
  ns: ["common", "features", "landing"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage unavailable (private mode) — language still applies for this session
  }
  applyDocumentLanguage(lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
