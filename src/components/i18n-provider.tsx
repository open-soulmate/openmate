"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { detectLanguage } from "@/lib/i18n";

export default function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    detectLanguage();
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
