"use client";

import { Download, RefreshCw, Share2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<InstallChoice>;
  prompt(): Promise<void>;
}

const INSTALL_DISMISSED_AT = "splithutang:pwa-install-dismissed-at";
const INSTALL_DISMISS_DURATION = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function wasInstallRecentlyDismissed() {
  try {
    const rawValue = window.localStorage.getItem(INSTALL_DISMISSED_AT);
    const dismissedAt = rawValue ? Number(rawValue) : 0;

    return Date.now() - dismissedAt < INSTALL_DISMISS_DURATION;
  } catch {
    return false;
  }
}

function rememberInstallDismissal() {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_AT, String(Date.now()));
  } catch {
    // Installation remains optional if storage is unavailable.
  }
}

export function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const reloadingForUpdate = useRef(false);

  useEffect(() => {
    queueMicrotask(() => setOnline(navigator.onLine));

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();

      if (!isStandalone() && !wasInstallRecentlyDismissed()) {
        setInstallEvent(event as BeforeInstallPromptEvent);
      }
    };
    const handleInstalled = () => {
      setInstallEvent(null);
      setShowIosInstructions(false);
    };
    const handleControllerChange = () => {
      if (reloadingForUpdate.current) {
        window.location.reload();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if (
      isIosDevice() &&
      !isStandalone() &&
      !wasInstallRecentlyDismissed()
    ) {
      queueMicrotask(() => setShowIosInstructions(true));
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );

      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }

          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;

            if (!installingWorker) {
              return;
            }

            installingWorker.addEventListener("statechange", () => {
              if (
                installingWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateReady(true);
              }
            });
          });

          return registration.update();
        })
        .catch((registrationError: unknown) => {
          console.error(
            "Unable to register the SplitHutang service worker:",
            registrationError,
          );
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      }
    };
  }, []);

  async function installApp() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;

    setInstallEvent(null);

    if (choice.outcome === "dismissed") {
      rememberInstallDismissal();
    }
  }

  function dismissInstall() {
    rememberInstallDismissal();
    setInstallEvent(null);
    setShowIosInstructions(false);
  }

  async function applyUpdate() {
    if (!("serviceWorker" in navigator)) {
      window.location.reload();
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("/");

    if (!registration?.waiting) {
      window.location.reload();
      return;
    }

    reloadingForUpdate.current = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <>
      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 z-[110] mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-zinc-950/95 px-4 py-2.5 text-xs font-medium text-amber-200 shadow-xl backdrop-blur"
          style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <WifiOff className="size-4 shrink-0" />
          You&apos;re offline. Existing screens stay visible, but changes need a
          connection.
        </div>
      )}

      {updateReady && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-blue-400/20 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"
          style={{
            bottom: "max(5.75rem, calc(4.75rem + env(safe-area-inset-bottom)))",
          }}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400">
            <RefreshCw className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">A new version is ready</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Refresh to use the latest SplitHutang update.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void applyUpdate()}
            className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      )}

      {!updateReady && (installEvent || showIosInstructions) && (
        <div
          role="dialog"
          aria-label="Install SplitHutang"
          className="fixed inset-x-3 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/[0.1] bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"
          style={{
            bottom: "max(5.75rem, calc(4.75rem + env(safe-area-inset-bottom)))",
          }}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400">
            {showIosInstructions ? (
              <Share2 className="size-5" />
            ) : (
              <Download className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Install SplitHutang</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {showIosInstructions
                ? "Tap Share, then Add to Home Screen to use it like an app and enable push notifications."
                : "Add it to this device for faster, app-like access."}
            </p>
            {installEvent && (
              <button
                type="button"
                onClick={() => void installApp()}
                className="mt-2 h-9 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white"
              >
                Install app
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={dismissInstall}
            aria-label="Dismiss install suggestion"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
