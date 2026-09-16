"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshUsageButton() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={refreshing}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-card px-3 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.05] disabled:opacity-60"
    >
      <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
      {refreshing ? "Refreshing" : "Refresh"}
    </button>
  );
}
