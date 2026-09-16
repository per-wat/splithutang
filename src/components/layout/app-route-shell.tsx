"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";

const APP_SHELL_ROUTES = new Set([
  "/",
  "/expenses",
  "/groups",
  "/getting-started",
  "/ious",
  "/notifications",
  "/people",
  "/profile",
  "/recurring",
  "/settings",
]);

export function AppRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!APP_SHELL_ROUTES.has(pathname)) {
    return children;
  }

  return <AppShell>{children}</AppShell>;
}
