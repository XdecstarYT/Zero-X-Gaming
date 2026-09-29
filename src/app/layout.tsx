import type { Metadata, Viewport } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/components/layout/Providers";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["600", "700", "800", "900"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Zero X | Gaming", template: "%s · Zero X | Gaming" },
  description: "Discover, play, and compete in original browser games. No downloads, just play.",
  applicationName: "Zero X | Gaming",
};

export const viewport: Viewport = {
  themeColor: "#05060b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${orbitron.variable} ${grotesk.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Navbar />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
