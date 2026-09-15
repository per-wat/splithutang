"use client";

import { ListRestart } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function RestartGettingStarted({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");

  async function restart() {
    if (restarting) return;

    setRestarting(true);
    setError("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ onboarding_dismissed_at: null })
      .eq("id", userId)
      .select("onboarding_dismissed_at")
      .single();

    if (updateError) {
      setError("Unable to restart Getting Started. Please try again.");
      setRestarting(false);
      return;
    }

    router.push("/getting-started");
    router.refresh();
  }

  return (
    <section className="mt-6 border-t border-white/[0.08] pt-6">
      <button
        type="button"
        onClick={() => void restart()}
        disabled={restarting}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-card p-4 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400">
          <ListRestart className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            {restarting ? "Restarting..." : "Restart Getting Started"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Show the tutorial again using your current setup and activity.
          </p>
        </div>
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
