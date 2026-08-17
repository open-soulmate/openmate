import zh from "@/locales/zh.json";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import { cookies } from "next/headers";

const resources: Record<string, typeof zh> = { zh, en, ja };

/**
 * Server-side translation helper for metadata and server components.
 * Reads locale from cookie "openmate-language" (same key as client i18n).
 */
export async function getServerTranslation(namespace?: string) {
  const cookieStore = await cookies();
  const lng = cookieStore.get("openmate-language")?.value || "zh";
  const dict = resources[lng] || resources.zh;

  function t(key: string): string {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const parts = fullKey.split(".");
    let val: any = dict;
    for (const p of parts) {
      val = val?.[p];
    }
    return typeof val === "string" ? val : key;
  }

  return { t, lng };
}
