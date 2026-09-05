"use client";

import { BellRing, BellOff, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { PushMode } from "@/lib/notifications/types";
import { getPushBrowserStatus } from "@/lib/notifications/rules";
import { createClient } from "@/lib/supabase/client";

const modes: Array<{ value: PushMode; label: string; description: string }> = [
  {
    value: "in_app_only",
    label: "In-app only",
    description: "Keep the activity record and live badge without lock-screen alerts.",
  },
  {
    value: "all_important",
    label: "All important notifications",
    description: "Push expense, IOU, payment and group activity to subscribed devices.",
  },
  {
    value: "payments_only",
    label: "Payment and settlement updates only",
    description: "Push only payment submissions, confirmations and settlements.",
  },
];

export function NotificationSettings({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<PushMode>("in_app_only");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isIosInstallRequired, setIsIosInstallRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void supabase
      .from("notification_preferences")
      .select("push_mode")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.push_mode) {
          setMode(data.push_mode);
        }
      });

    const hasSupport =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;

    queueMicrotask(() => {
      if (active) {
        setSupported(hasSupport);
        setIsIosInstallRequired(ios && !standalone);
      }
    });

    if (hasSupport) {
      queueMicrotask(() => {
        if (active) {
          setPermission(Notification.permission);
        }
      });
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.pushManager.getSubscription())
        .then((currentSubscription) => {
          if (active) {
            setSubscription(currentSubscription);
          }
        })
        .catch((registrationError: unknown) => {
          console.error("Unable to register the push service worker:", registrationError);
          if (active) {
            setError("Push setup is unavailable in this browser context.");
          }
        });
    }

    return () => {
      active = false;
    };
  }, [supabase, userId]);

  async function saveMode(nextMode: PushMode) {
    setMode(nextMode);
    setSaving(true);
    setError("");
    setMessage("");

    const { error: saveError } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, push_mode: nextMode });

    if (saveError) {
      setError("Unable to save your notification preference.");
    } else {
      setMessage("Notification preference saved.");
    }
    setSaving(false);
  }

  async function enablePush() {
    if (!supported || isIosInstallRequired || saving || permission === "denied") {
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setError("Push is not configured for this deployment.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const nextPermission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setError("Notification permission was not granted. You can keep using in-app notifications.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const nextSubscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const serialized = nextSubscription.toJSON();

      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error("Browser returned an incomplete push subscription");
      }

      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: serialized.endpoint, keys: serialized.keys }),
      });

      if (!response.ok) {
        throw new Error("Unable to save the browser subscription");
      }

      setSubscription(nextSubscription);
      setMessage("Push notifications are enabled on this browser.");
    } catch (pushError) {
      console.error("Unable to enable push:", pushError);
      setError("Push could not be enabled. Check the browser permission and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function disablePush() {
    if (!subscription || saving) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      if (!response.ok) {
        throw new Error("Unable to remove the browser subscription");
      }

      await subscription.unsubscribe();
      setSubscription(null);
      setMessage("Push is disabled on this browser. In-app notifications remain on.");
    } catch (pushError) {
      console.error("Unable to disable push:", pushError);
      setError("Push could not be disabled. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/[0.08] bg-card p-4" aria-labelledby="notification-settings-title">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400">
          <BellRing className="size-5" />
        </div>
        <div>
          <h2 id="notification-settings-title" className="font-semibold">Notifications</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            In-app activity is always available. Choose whether this device should also receive Web Push.
          </p>
        </div>
      </div>

      <fieldset className="mt-5 space-y-2" disabled={saving}>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Push preference</legend>
        {modes.map((option) => (
          <label key={option.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === option.value ? "border-blue-500/40 bg-blue-600/[0.08]" : "border-white/[0.07]"}`}>
            <input
              type="radio"
              name="push-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => void saveMode(option.value)}
              className="mt-1 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="size-4 text-muted-foreground" /> This browser
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {getPushBrowserStatus({
            supported,
            permission,
            subscribed: Boolean(subscription),
            iosInstallRequired: isIosInstallRequired,
          })}
        </p>

        {isIosInstallRequired && (
          <p className="mt-2 text-xs leading-relaxed text-amber-300">On iPhone and iPad, install SplitHutang with “Add to Home Screen,” then open the installed app to enable push.</p>
        )}

        {permission === "denied" && (
          <p className="mt-2 text-xs leading-relaxed text-amber-300">Permission is blocked. Re-enable notifications in your browser or device settings; SplitHutang will not prompt again.</p>
        )}

        {supported &&
          !isIosInstallRequired &&
          permission !== "denied" &&
          (Boolean(subscription) || mode !== "in_app_only") && (
          <button
            type="button"
            onClick={() => void (subscription ? disablePush() : enablePush())}
            disabled={saving}
            className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${subscription ? "bg-white/[0.06] text-muted-foreground" : "bg-blue-600 text-white"}`}
          >
            {subscription ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
            {saving ? "Please wait..." : subscription ? "Disable on this browser" : "Enable push on this browser"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-400">{message}</p>}
    </section>
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
