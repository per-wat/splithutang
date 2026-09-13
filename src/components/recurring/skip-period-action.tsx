"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function SkipPeriodAction({ periodId, skipped }: { periodId: string; skipped: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setSaving(true);
    setError("");
    const { error: saveError } = await supabase.rpc("set_recurring_period_skipped", {
      p_period_id: periodId,
      p_skipped: !skipped,
      p_reason: skipped ? "" : "Skipped by payer",
    });
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return <div><button type="button" disabled={saving} onClick={toggle} className="text-xs font-semibold text-muted-foreground underline underline-offset-4 disabled:opacity-50">{saving ? "Saving..." : skipped ? "Restore payment for this month" : "No payment this month"}</button>{error && <p className="mt-1 text-xs text-red-400">{error}</p>}</div>;
}
