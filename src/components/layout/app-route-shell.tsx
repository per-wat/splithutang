"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";

const APP_SHELL_ROUTES = new Set([
  "/",
  "/announcements",
  "/feature-access",
  "/tax-receipts",
  "/expenses",
  "/groups",
  "/getting-started",
  "/installment-calculator",
  "/ious",
  "/notifications",
  "/payment-qr",
  "/people",
  "/profile",
  "/recurring",
  "/settings",
  "/usage",
]);

export function AppRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!APP_SHELL_ROUTES.has(pathname) && !pathname.startsWith("/tax-receipts/")) {
    return children;
  }

  return <AppShell>{children}</AppShell>;
}
