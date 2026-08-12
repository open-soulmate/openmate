import type { Metadata } from "next";
import "./globals.css";
import I18nProvider from "@/components/i18n-provider";

export const metadata: Metadata = {
  title: "OpenMate — Your Knowledge Companion",
  description: "An open AI companion platform with pluggable skill extensions",
};

// Inline script to prevent FOUC on theme load
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('openmate-theme') || 'dark';
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    if (t === 'light') { r.classList.add('light'); }
    else if (t === 'purple') { r.classList.add('dark', 'theme-purple'); }
    else { r.classList.add('dark'); }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
