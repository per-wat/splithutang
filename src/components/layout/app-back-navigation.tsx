"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { getParentRoute } from "@/lib/navigation";

const ROUTE_GUARD_STATE_KEY = "__splitHutangRouteGuard";

export function AppBackNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const exitingRef = useRef(false);
  const exitResetTimerRef = useRef<number | null>(null);
  const closeFallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (exitingRef.current) return;
    if (pathname !== "/" && getParentRoute(pathname) === null) return;

    const currentState = window.history.state;

    if (currentState?.[ROUTE_GUARD_STATE_KEY] === pathname) return;

    const nextState =
      currentState && typeof currentState === "object"
        ? { ...currentState, [ROUTE_GUARD_STATE_KEY]: pathname }
        : { [ROUTE_GUARD_STATE_KEY]: pathname };

    window.history.pushState(nextState, "", window.location.href);
  }, [pathname]);

  useEffect(() => {
    function continueLeavingApp() {
      exitingRef.current = true;
      window.history.back();

      if (exitResetTimerRef.current !== null) {
        window.clearTimeout(exitResetTimerRef.current);
      }

      exitResetTimerRef.current = window.setTimeout(() => {
        exitingRef.current = false;
        exitResetTimerRef.current = null;
      }, 500);
    }

    function handlePopState(event: PopStateEvent) {
      if (exitingRef.current) {
        continueLeavingApp();
        return;
      }

      if (event.state?.[ROUTE_GUARD_STATE_KEY] === pathname) {
        return;
      }

      const parentRoute = getParentRoute(pathname);

      if (parentRoute) {
        router.replace(parentRoute);
        return;
      }

      if (pathname === "/") {
        const rootUrl = window.location.href;
        continueLeavingApp();

        closeFallbackTimerRef.current = window.setTimeout(() => {
          const navigatorWithStandalone = navigator as Navigator & {
            standalone?: boolean;
          };
          const standalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            navigatorWithStandalone.standalone === true;

          if (
            exitingRef.current &&
            standalone &&
            document.visibilityState !== "hidden" &&
            window.location.href === rootUrl
          ) {
            window.close();
          }
        }, 150);
      }
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [pathname, router]);

  useEffect(() => {
    return () => {
      if (exitResetTimerRef.current !== null) {
        window.clearTimeout(exitResetTimerRef.current);
      }

      if (closeFallbackTimerRef.current !== null) {
        window.clearTimeout(closeFallbackTimerRef.current);
      }
    };
  }, []);

  return null;
}
