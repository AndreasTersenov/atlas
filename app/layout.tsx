import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas — a personal cosmic web",
  description:
    "Andreas Tersenov's projects, rendered as a cosmic-web map. Halos are projects; filaments are shared methodology, dependencies, and career arcs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        suppressHydrationWarning silences the SSR/CSR mismatch caused by
        browser extensions (e.g. Grammarly) that inject attributes onto
        <body> after first paint. Only suppresses warnings on this element
        itself, not its children — safe.
      */}
      <body
        suppressHydrationWarning
        className="min-h-full bg-[#0A0214] text-[#E8D6F4]"
      >
        {children}
      </body>
    </html>
  );
}
