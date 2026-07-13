import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Analytics } from "@/components/dom/Analytics";
import { site } from "@/content/site";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-mono" });
const display = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-display" });

export const metadata: Metadata = {
  title: site.meta.title,
  description: site.meta.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`} data-scroll-behavior="smooth">
      <body>
        <noscript>
          <style>{`[data-loader]{display:none}`}</style>
        </noscript>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
