"use client";

import { BellOff, BellRing, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { usePwa } from "@/components/pwa/pwa-manager";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { getPushBrowserStatus } from "@/lib/notifications/rules";
import type { PushMode } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/client";

const modes: Array<{ value: PushMode; label: string; description: string }> = [
  {
    value: "in_app_only",
    label: "In-app only",
    description:
      "Keep the activity record and live badge without lock-screen alerts.",
  },
  {
    value: "all_important",
    label: "All important notifications",
    description:
      "Push expense, Hutang, payment and group activity to subscribed devices.",
  },
  {
    value: "payments_only",
    label: "Payment updates only",
    description: "Push only payments, confirmations and fully paid updates.",
  },
];

export function NotificationSettings({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { platform, standalone } = usePwa();
  const isIosInstallRequired = platform === "ios" && standalone === false;
  const push = usePushSubscription({
    iosInstallRequired: isIosInstallRequired,
    autoSubscribeWhenGranted: true,
  });
  const [mode, setMode] = useState<PushMode>("in_app_only");
  const [savingPreference, setSavingPreference] = useState(false);
  const [message, setMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState("");

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

    return () => {
      active = false;
    };
  }, [supabase, userId]);

  async function saveMode(nextMode: PushMode) {
    setMode(nextMode);
    setSavingPreference(true);
    setPreferenceError("");
    setMessage("");

    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, push_mode: nextMode });

    if (error) {
      setPreferenceError("Unable to save your notification preference.");
    } else {
      setMessage("Notification preference saved.");
    }
    setSavingPreference(false);
  }

  async function enablePush() {
    setMessage("");
    push.clearError();

    const subscription = await push.enable(true);
    if (subscription) {
      setMessage("Push notifications are enabled on this browser.");
    }
  }

  async function disablePush() {
    setMessage("");
    push.clearError();

    if (await push.disable()) {
      setMessage(
        "Push is disabled on this browser. In-app notifications remain on.",
      );
    }
  }

  const saving = savingPreference || push.busy;

  return (
    <section
      className="mt-6 rounded-2xl border border-white/[0.08] bg-card p-4"
      aria-labelledby="notification-settings-title"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400">
          <BellRing className="size-5" />
        </div>
        <div>
          <h2 id="notification-settings-title" className="font-semibold">
            Notifications
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            In-app activity is always available. Choose whether this device
            should also receive alerts.
          </p>
        </div>
      </div>

      <fieldset className="mt-5 space-y-2" disabled={saving}>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Alert preference
        </legend>
        {modes.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
              mode === option.value
                ? "border-blue-500/40 bg-blue-600/[0.08]"
                : "border-white/[0.07]"
            }`}
          >
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
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </span>
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
            supported: push.supported,
            permission: push.permission,
            subscribed: Boolean(push.subscription),
            iosInstallRequired: isIosInstallRequired,
          })}
        </p>

        {isIosInstallRequired && (
          <p className="mt-2 text-xs leading-relaxed text-amber-300">
            On iPhone and iPad, add SplitHutang to your Home Screen, then open
            it from the new icon to turn on notifications.
          </p>
        )}

        {push.permission === "denied" && (
          <p className="mt-2 text-xs leading-relaxed text-amber-300">
            Permission is blocked. Re-enable notifications in your browser or
            device settings; SplitHutang will not prompt again.
          </p>
        )}

        {push.supported &&
          !isIosInstallRequired &&
          push.permission !== "denied" &&
          (Boolean(push.subscription) || mode !== "in_app_only") && (
            <button
              type="button"
              onClick={() =>
                void (push.subscription ? disablePush() : enablePush())
              }
              disabled={saving}
              className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                push.subscription
                  ? "bg-white/[0.06] text-muted-foreground"
                  : "bg-blue-600 text-white"
              }`}
            >
              {push.subscription ? (
                <BellOff className="size-4" />
              ) : (
                <BellRing className="size-4" />
              )}
              {saving
                ? "Please wait..."
                : push.subscription
                  ? "Disable on this browser"
                  : "Enable on this browser"}
            </button>
          )}
      </div>

      {(preferenceError || push.error) && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {preferenceError || push.error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-400">
          {message}
        </p>
      )}
    </section>
  );
}
