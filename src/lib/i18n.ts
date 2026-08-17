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
    // 用户手动设置过语言，优先使用
    i18n.changeLanguage(saved);
    return;
  }
  // 自适应操作系统语言
  const langs = navigator.languages || [navigator.language];
  for (const lang of langs) {
    const code = lang.split("-")[0].toLowerCase();
    if (["zh", "en", "ja"].includes(code)) {
      i18n.changeLanguage(code);
      return;
    }
  }
  // 系统语言不在支持列表，保持默认zh
}

export default i18n;
