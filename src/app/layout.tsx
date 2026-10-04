import type { Metadata, Viewport } from "next";
import { Nunito, Orbitron, Space_Grotesk } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/components/layout/Providers";
import { Toaster } from "@/components/ui/Toaster";
import { IntroSplash, introGateScript } from "@/components/layout/IntroSplash";
import { MegaAd } from "@/components/layout/MegaAd";
import { Code3Ad } from "@/components/layout/Code3Ad";
import { UBusinessAd } from "@/components/layout/UBusinessAd";
import { SportsAd } from "@/components/layout/SportsAd";
import { CricketAd } from "@/components/layout/CricketAd";
import { ClanforgeAd } from "@/components/layout/ClanforgeAd";
import { SportsInduction } from "@/components/sports/SportsInduction";
import { SITE_URL } from "@/lib/site";
import { themeScript } from "@/store/settings";
import "./globals.css";

const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["600", "700", "800", "900"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });
// X-1+ theme: a rounded, friendly face for headings and text.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Zero X | Gaming", template: "%s · Zero X | Gaming" },
  description: "Discover, play, and compete in original browser games. No downloads, just play.",
  applicationName: "Zero X | Gaming",
  openGraph: { type: "website", siteName: "Zero X | Gaming" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#05060b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${orbitron.variable} ${grotesk.variable} ${nunito.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Hides the intro before first paint for visitors who've already seen it this session. */}
        <script dangerouslySetInnerHTML={{ __html: introGateScript }} />
        {/* Applies the saved site theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] font-sans md:pb-0">
        <IntroSplash />
        <MegaAd />
        <UBusinessAd />
        <CricketAd />
        <ClanforgeAd />
        <SportsAd />
        <Code3Ad />
        <SportsInduction />
        <Providers>
          <Navbar />
          <AnnouncementBanner />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer />
          <BottomNav />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
