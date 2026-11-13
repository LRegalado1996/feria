import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { EnvironmentMarker } from "@/app/_components/molecules/environment-marker";
import { AppProviders } from "@/app/_components/organisms/app-providers";
import { APP_LOCALE } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Feria",
  description:
    "Small stores, one fair: browse the catalog and order from your phone",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available (no `maximumScale`, no `userScalable: false`):
  // locking it shuts low-vision users out of the page on mobile.
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // next-themes sets the theme class on <html> before React hydrates, so
    // the server's markup cannot know it.
    <html className={geist.variable} lang={APP_LOCALE} suppressHydrationWarning>
      <body>
        {/* First in <body>: chrome rendered later at the same z-index paints
            over the line, never the other way round. */}
        <EnvironmentMarker />
        <AppProviders>{children}</AppProviders>
        {/* Vercel serves their scripts once Analytics and Speed Insights are
            enabled in the project; anywhere else the scripts 404. */}
        {process.env.VERCEL === "1" ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
