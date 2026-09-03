"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type PaymentReviewActionsProps = {
  kind: "expense" | "iou";
  paymentId: string;
};

export function PaymentReviewActions({
  kind,
  paymentId,
}: PaymentReviewActionsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [saving, setSaving] = useState<"confirmed" | "rejected" | null>(null);

  const [error, setError] = useState("");

  async function review(decision: "confirmed" | "rejected") {
    if (saving) return;

    setSaving(decision);
    setError("");

    const result =
      kind === "expense"
        ? await supabase.rpc("review_expense_payment", {
            p_payment_id: paymentId,
            p_decision: decision,
          })
        : await supabase.rpc("review_iou_payment", {
            p_payment_id: paymentId,
            p_decision: decision,
          });

    if (result.error) {
      console.error("Unable to review payment:", result.error);

      setError(result.error.message);
      setSaving(null);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => review("confirmed")}
          className="flex-1 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {saving === "confirmed" ? "Confirming..." : "Confirm"}
        </button>

        <button
          type="button"
          disabled={saving !== null}
          onClick={() => review("rejected")}
          className="flex-1 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
        >
          {saving === "rejected" ? "Rejecting..." : "Reject"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
