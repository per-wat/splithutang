"use client";

import {
  BellRing,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  LockKeyhole,
  Share2,
  Smartphone,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useSetupStatus } from "@/components/onboarding/use-setup-status";
import type { PushMode } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/client";

export function GettingStartedExperience({
  userId,
  initialPushMode,
}: {
  userId: string;
  initialPushMode: PushMode | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pwa, push, installState, notificationState, progress } =
    useSetupStatus();
  const [pushMode, setPushMode] = useState(initialPushMode);
  const [message, setMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const [installing, setInstalling] = useState(false);

  async function installApp() {
    if (!pwa.installPromptAvailable || installing) return;

    setInstalling(true);
    setMessage("");
    const outcome = await pwa.installApp();

    if (outcome === "accepted") {
      setMessage(
        "Installation started. Open SplitHutang from its new Home Screen icon to complete this step.",
      );
    } else if (outcome === "dismissed") {
      setMessage(
        "No problem. You can return here and try again when your browser offers installation.",
      );
    } else {
      setMessage(
        "The installer is not available right now. Use the browser instructions shown below.",
      );
    }
    setInstalling(false);
  }

  async function enableNotifications(requestPermission: boolean) {
    setMessage("");
    setPreferenceError("");
    push.clearError();

    const subscription = await push.enable(requestPermission);
    if (!subscription) return;

    // A new user starts in in-app-only mode. Enabling notifications here is an
    // explicit choice to receive the full useful set of alerts. Preserve an
    // existing payments-only choice made in Profile.
    if (!pushMode || pushMode === "in_app_only") {
      const { error } = await supabase.from("notification_preferences").upsert({
        user_id: userId,
        push_mode: "all_important",
      });

      if (error) {
        setPreferenceError(
          "Notifications are on, but the alert preference could not be saved. Review it in Profile & Settings.",
        );
      } else {
        setPushMode("all_important");
      }
    }

    setMessage("Notifications are on for this device.");
  }

  return (
    <div className="px-5 pb-8 pt-4">
      <section className="rounded-2xl border border-white/[0.08] bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-400">
              Getting Started
            </p>
            <h2 className="mt-1 text-lg font-bold">
              {progress.complete
                ? "Setup complete ✓"
                : "Finish setting up SplitHutang"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.complete
                ? "This device is ready to use."
                : `${progress.completedCount} of ${progress.totalCount} complete`}
            </p>
          </div>
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
              progress.complete
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-blue-600/15 text-blue-400"
            }`}
          >
            {progress.complete ? (
              <Check className="size-5" />
            ) : (
              <Smartphone className="size-5" />
            )}
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className={`h-full rounded-full transition-[width] ${
              progress.complete ? "bg-emerald-500" : "bg-blue-500"
            }`}
            style={{
              width: `${(progress.completedCount / progress.totalCount) * 100}%`,
            }}
          />
        </div>
      </section>

      <div className="mt-4 space-y-4">
        <SetupStep
          number={1}
          title="Add SplitHutang to your Home Screen"
          description="Open SplitHutang just like any other app."
          complete={progress.installed}
          icon={Smartphone}
        >
          {installState === "checking" && <CheckingState />}

          {installState === "complete" && (
            <CompleteState message="SplitHutang is open from your Home Screen." />
          )}

          {installState === "native_prompt" && (
            <button
              type="button"
              onClick={() => void installApp()}
              disabled={installing}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Download className="size-4" />
              {installing ? "Opening installer..." : "Install SplitHutang"}
            </button>
          )}

          {installState === "ios_guide" && (
            <IosInstallGuide isSafari={pwa.isIosSafari === true} />
          )}

          {installState === "manual_guide" && (
            <ManualInstallGuide platform={pwa.platform} />
          )}
        </SetupStep>

        <SetupStep
          number={2}
          title="Turn on notifications"
          description="Know when money is paid, changed, waiting for confirmation, or nearly due."
          complete={progress.notificationsEnabled}
          icon={BellRing}
        >
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            SplitHutang can alert you when someone records or updates a payment,
            pays you, a payment needs confirmation, or a recurring payment is
            approaching its due date.
          </p>

          {notificationState === "checking" && <CheckingState />}

          {notificationState === "complete" && (
            <CompleteState message="Notifications are on for this device." />
          )}

          {notificationState === "install_required" && (
            <div className="mt-4 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.07] p-3 text-amber-200">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs leading-relaxed">
                First add SplitHutang to your Home Screen, then launch it from
                the new icon. You can turn on notifications after that.
              </p>
            </div>
          )}

          {notificationState === "permission_default" && (
            <button
              type="button"
              onClick={() => void enableNotifications(true)}
              disabled={push.busy}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50"
            >
              <BellRing className="size-4" />
              {push.busy ? "Turning on..." : "Turn on notifications"}
            </button>
          )}

          {notificationState === "subscription_missing" && (
            <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Permission is already allowed. SplitHutang is finishing the
                connection for this device.
              </p>
              {!push.busy && (
                <button
                  type="button"
                  onClick={() => void enableNotifications(false)}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white"
                >
                  <BellRing className="size-4" /> Try again
                </button>
              )}
            </div>
          )}

          {notificationState === "permission_denied" && (
            <DeniedNotificationHelp platform={pwa.platform} />
          )}

          {notificationState === "unsupported" && (
            <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                This browser cannot send device notifications. Your in-app
                notification centre will still work normally.
              </p>
            </div>
          )}
        </SetupStep>
      </div>

      {(push.error || preferenceError) && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {push.error || preferenceError}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-emerald-400">
          {message}
        </p>
      )}
    </div>
  );
}

function SetupStep({
  number,
  title,
  description,
  complete,
  icon: Icon,
  children,
}: {
  number: number;
  title: string;
  description: string;
  complete: boolean;
  icon: typeof Smartphone;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
            complete
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-white/[0.06] text-blue-400"
          }`}
        >
          {complete ? <Check className="size-5" /> : <Icon className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Step {number}
          </p>
          <h3 className="mt-0.5 font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function IosInstallGuide({ isSafari }: { isSafari: boolean }) {
  const steps = [
    "Open SplitHutang using Safari.",
    "Tap the Share icon at the bottom of Safari.",
    "Scroll and select Add to Home Screen.",
    "Turn on Open as Web App if that option appears.",
    "Tap Add.",
    "Launch SplitHutang from the new Home Screen icon.",
  ];

  return (
    <div className="mt-4">
      {!isSafari && (
        <div className="mb-3 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.07] p-3 text-amber-200">
          <ExternalLink className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs leading-relaxed">
            You are using another browser. Copy or reopen this page in Safari
            before following the steps below.
          </p>
        </div>
      )}

      <ol className="space-y-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600/15 text-xs font-bold text-blue-300">
              {index + 1}
            </span>
            <span className="pt-0.5 leading-relaxed text-zinc-300">
              {index === 1 && <Share2 className="mr-1.5 inline size-4" />}
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ManualInstallGuide({
  platform,
}: {
  platform: "android" | "ios" | "other" | null;
}) {
  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {platform === "android"
          ? "The install button is not available right now. In Chrome, open the browser menu and choose Install app or Add to Home screen. If you dismissed installation earlier, you can return here when Chrome offers it again."
          : "The install button is not available in this browser. Open the browser menu and look for Install app or Add to Home Screen."}
      </p>
    </div>
  );
}

function DeniedNotificationHelp({
  platform,
}: {
  platform: "android" | "ios" | "other" | null;
}) {
  return (
    <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.07] p-3">
      <p className="text-sm font-semibold text-amber-200">
        Notifications are turned off
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
        SplitHutang will not ask again because notifications were previously
        blocked.
      </p>
      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-amber-200">
          Show me how
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-amber-100/70">
          {platform === "ios"
            ? "Open iPhone Settings, find SplitHutang, select Notifications, and turn on Allow Notifications. Then return here."
            : platform === "android"
              ? "Open this site's settings from your browser address bar or menu, choose Permissions, set Notifications to Allow, then return here."
              : "Open this site's permissions in your browser settings, change Notifications to Allow, then return here."}
        </p>
      </details>
    </div>
  );
}

function CompleteState({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/[0.08] p-3 text-emerald-300">
      <Check className="size-4 shrink-0" />
      <p className="text-xs font-medium">{message}</p>
    </div>
  );
}

function CheckingState() {
  return (
    <p className="mt-4 text-xs text-muted-foreground">Checking this device...</p>
  );
}
