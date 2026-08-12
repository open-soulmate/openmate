"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zh from "@/locales/zh.json";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";

const STORAGE_KEY = "openmate-language";

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: "zh",
  fallbackLng: "zh",
  supportedLngs: ["zh", "en", "ja"],
  interpolation: {
    escapeValue: false,
  },
});

export function detectLanguage() {
  if (typeof window === "undefined") return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && ["zh", "en", "ja"].includes(saved)) {
    i18n.changeLanguage(saved);
  } else {
    const nav = navigator.language.split("-")[0];
    if (["zh", "en", "ja"].includes(nav)) {
      i18n.changeLanguage(nav);
    }
  }
}

export default i18n;
