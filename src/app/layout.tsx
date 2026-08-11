import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenMate — Your Knowledge Companion",
  description: "An open AI companion platform with pluggable skill extensions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
