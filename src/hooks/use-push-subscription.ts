"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  disablePushSubscription,
  enablePushSubscription,
  getCurrentPushSubscription,
  isPushSupported,
} from "@/lib/notifications/push-client";

export function usePushSubscription(input: {
  iosInstallRequired: boolean;
  autoSubscribeWhenGranted?: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [subscription, setSubscription] =
    useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoSubscribeAttempted = useRef(false);

  const refresh = useCallback(async () => {
    const hasSupport = isPushSupported();
    setSupported(hasSupport);

    if (!hasSupport) {
      setSubscription(null);
      return;
    }

    setPermission(Notification.permission);

    try {
      setSubscription(await getCurrentPushSubscription());
    } catch (caughtError) {
      console.error("Unable to check the push subscription:", caughtError);
      setError("Notification setup is unavailable in this browser right now.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const refreshWhenActive = () => {
      if (active) void refresh();
    };

    queueMicrotask(refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refresh]);

  const enable = useCallback(
    async (requestPermission: boolean) => {
      if (
        supported !== true ||
        input.iosInstallRequired ||
        busy ||
        Notification.permission === "denied"
      ) {
        return null;
      }

      setBusy(true);
      setError("");

      try {
        const result = await enablePushSubscription({ requestPermission });
        setPermission(result.permission);
        setSubscription(result.subscription);

        if (result.permission !== "granted") {
          setError(
            "Notifications were not allowed. You can still use the in-app notification centre.",
          );
        }

        return result.subscription;
      } catch (caughtError) {
        console.error("Unable to enable push:", caughtError);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Notifications could not be enabled. Please try again.",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, input.iosInstallRequired, supported],
  );

  const disable = useCallback(async () => {
    if (!subscription || busy) return false;

    setBusy(true);
    setError("");

    try {
      await disablePushSubscription(subscription);
      setSubscription(null);
      return true;
    } catch (caughtError) {
      console.error("Unable to disable push:", caughtError);
      setError("Notifications could not be disabled. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, subscription]);

  useEffect(() => {
    if (
      !input.autoSubscribeWhenGranted ||
      supported !== true ||
      permission !== "granted" ||
      subscription ||
      input.iosInstallRequired ||
      autoSubscribeAttempted.current
    ) {
      return;
    }

    autoSubscribeAttempted.current = true;
    void enable(false);
  }, [
    enable,
    input.autoSubscribeWhenGranted,
    input.iosInstallRequired,
    permission,
    subscription,
    supported,
  ]);

  return {
    supported,
    permission,
    subscription,
    busy,
    error,
    clearError: () => setError(""),
    enable,
    disable,
    refresh,
  };
}
