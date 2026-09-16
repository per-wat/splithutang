"use client";

import {
  Check,
  Download,
  ExternalLink,
  Share2,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

import { usePwa } from "@/components/pwa/pwa-manager";

export function AppInstallationSettings() {
  const pwa = usePwa();
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  async function installApp() {
    if (!pwa.installPromptAvailable || installing) return;

    setInstalling(true);
    setMessage("");

    const outcome = await pwa.installApp();

    if (outcome === "accepted") {
      setMessage(
        "Installation started. Launch SplitHutang from the new Home Screen icon when it appears.",
      );
    } else if (outcome === "dismissed") {
      setMessage("Installation was cancelled. You can try again here later.");
    } else {
      setMessage(
        "The installer is unavailable right now. Follow the browser instructions below.",
      );
    }

    setInstalling(false);
  }

  return (
    <section
      className="rounded-2xl border border-white/[0.08] bg-card p-4"
      aria-labelledby="app-installation-title"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400">
          <Smartphone className="size-5" />
        </div>
        <div>
          <h2 id="app-installation-title" className="font-semibold">
            App installation
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Add SplitHutang to this device for faster, app-like access.
          </p>
        </div>
      </div>

      {pwa.standalone === null && (
        <p className="mt-4 text-xs text-muted-foreground">
          Checking this device...
        </p>
      )}

      {pwa.standalone === true && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/[0.08] p-3 text-emerald-300">
          <Check className="size-4 shrink-0" />
          <p className="text-xs font-medium">
            SplitHutang is open from your Home Screen.
          </p>
        </div>
      )}

      {pwa.standalone === false && pwa.platform === "ios" && (
        <IosInstallationGuide isSafari={pwa.isIosSafari === true} />
      )}

      {pwa.standalone === false &&
        pwa.platform !== "ios" &&
        pwa.installPromptAvailable && (
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

      {pwa.standalone === false &&
        pwa.platform !== "ios" &&
        !pwa.installPromptAvailable && (
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {pwa.platform === "android"
                ? "Open your browser menu and choose Install app or Add to Home screen. If you dismissed installation earlier, return here when the browser offers it again."
                : "Open your browser menu and look for Install app or Add to Home Screen."}
            </p>
          </div>
        )}

      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-400">
          {message}
        </p>
      )}
    </section>
  );
}

function IosInstallationGuide({ isSafari }: { isSafari: boolean }) {
  const steps = [
    "Open SplitHutang using Safari.",
    "Tap the Share icon at the bottom of Safari.",
    "Scroll and select Add to Home Screen.",
    "Turn on Open as Web App if that option appears.",
    "Tap Add, then launch SplitHutang from the new icon.",
  ];

  return (
    <div className="mt-4">
      {!isSafari && (
        <div className="mb-3 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.07] p-3 text-amber-200">
          <ExternalLink className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs leading-relaxed">
            Reopen SplitHutang in Safari before following these steps.
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
