import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import arCommon from "./locales/ar/common.json";
import enFeatures from "./locales/en/features.json";
import arFeatures from "./locales/ar/features.json";
import enLanding from "./locales/en/landing.json";
import arLanding from "./locales/ar/landing.json";
import enWallet from "./locales/en/wallet.json";
import arWallet from "./locales/ar/wallet.json";
import enTopup from "./locales/en/topup.json";
import arTopup from "./locales/ar/topup.json";
import enLaunch from "./locales/en/launch.json";
import arLaunch from "./locales/ar/launch.json";
import enAudiences from "./locales/en/audiences.json";
import arAudiences from "./locales/ar/audiences.json";
import enOptimizer from "./locales/en/optimizer.json";
import arOptimizer from "./locales/ar/optimizer.json";
import enInbox from "./locales/en/inbox.json";
import arInbox from "./locales/ar/inbox.json";
import enWeekly from "./locales/en/weekly.json";
import arWeekly from "./locales/ar/weekly.json";
import enTone from "./locales/en/tone.json";
import arTone from "./locales/ar/tone.json";
import enDelivery from "./locales/en/delivery.json";
import arDelivery from "./locales/ar/delivery.json";

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
    en: {
      common: enCommon,
      features: enFeatures,
      landing: enLanding,
      wallet: enWallet,
      topup: enTopup,
      launch: enLaunch,
      audiences: enAudiences,
      optimizer: enOptimizer,
      inbox: enInbox,
      weekly: enWeekly,
      tone: enTone,
      delivery: enDelivery,
    },
    ar: {
      common: arCommon,
      features: arFeatures,
      landing: arLanding,
      wallet: arWallet,
      topup: arTopup,
      launch: arLaunch,
      audiences: arAudiences,
      optimizer: arOptimizer,
      inbox: arInbox,
      weekly: arWeekly,
      tone: arTone,
      delivery: arDelivery,
    },
  },
  lng: initial,
  fallbackLng: "en",
  ns: [
    "common",
    "features",
    "landing",
    "wallet",
    "topup",
    "launch",
    "audiences",
    "optimizer",
    "inbox",
    "weekly",
    "tone",
    "delivery",
  ],
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
