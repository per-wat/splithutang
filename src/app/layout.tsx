import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { AppRouteShell } from "@/components/layout/app-route-shell";
import { PwaManager } from "@/components/pwa/pwa-manager";

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
  applicationName: "SplitHutang",
  title: {
    default: "SplitHutang",
    template: "%s · SplitHutang",
  },
  description: "Share expenses and keep track of what is owed.",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    title: "SplitHutang",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaManager />
        <AppRouteShell>{children}</AppRouteShell>
        <SpeedInsights />
      </body>
    </html>
  );
}
