import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CodeSentinel — Agentic Code Security Pipeline",
  description:
    "A multi-agent DevSecOps IDE that generates, executes, and secures Node.js code in real time with live pipeline streaming.",
  keywords: ["code security", "DevSecOps", "AI coding", "LangGraph", "pipeline"],
  authors: [{ name: "CodeSentinel" }],
  openGraph: {
    title: "CodeSentinel — Agentic Code Security Pipeline",
    description: "Multi-agent DevSecOps pipeline with live security scanning",
    type: "website",
  },
};

import SessionManager from "@/components/layout/SessionManager";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <SessionManager />
      </body>
    </html>
  );
}
