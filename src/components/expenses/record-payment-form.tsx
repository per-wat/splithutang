"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type RecordPaymentFormProps = {
  expenseId: string;
  personId: string;
  personName: string;
  remaining: number;
  availableToSubmit: number;
  requiresConfirmation: boolean;
  onClose: () => void;
};

export function RecordPaymentForm({
  expenseId,
  personId,
  personName,
  remaining,
  availableToSubmit,
  requiresConfirmation,
  onClose,
}: RecordPaymentFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [amount, setAmount] = useState(availableToSubmit.toFixed(2));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const numericAmount = Number(amount) || 0;

  const canSave =
    numericAmount > 0 && numericAmount <= availableToSubmit && !saving;

  const pendingReserved = Math.max(remaining - availableToSubmit, 0);

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("record_expense_payment", {
      p_expense_id: expenseId,
      p_from_person_id: personId,
      p_amount: numericAmount,
      p_note: note.trim(),
    });

    if (error) {
      console.error("Unable to record payment:", error);
      setError(error.message);
      setSaving(false);
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60">
      <button
        type="button"
        aria-label="Close payment form"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-md rounded-t-3xl border-t border-white/[0.08] bg-background px-5 pb-8 pt-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">
              {requiresConfirmation ? "Submit Payment" : "Record Payment"}
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Payment from {personName}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-white/[0.04] px-4 py-3">
          <p className="text-xs text-muted-foreground">Remaining debt</p>
          <p className="mt-1 text-lg font-bold">RM {remaining.toFixed(2)}</p>

          {pendingReserved > 0 && (
            <p className="mt-1 text-xs text-amber-400">
              RM {pendingReserved.toFixed(2)} is already pending confirmation.
            </p>
          )}
        </div>

        {requiresConfirmation && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <p className="text-xs text-amber-300">
              This payment will remain pending until the person receiving the
              money confirms it.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label
            htmlFor="payment-amount"
            className="text-sm font-semibold"
          >
            Amount (RM)
          </label>

          <input
            id="payment-amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max={availableToSubmit}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 outline-none transition-colors focus:border-blue-500"
          />

          {numericAmount > availableToSubmit && (
            <p className="mt-2 text-xs text-red-400">
              Payment cannot exceed RM {availableToSubmit.toFixed(2)}.
            </p>
          )}
        </div>

        <div className="mt-4">
          <label
            htmlFor="payment-note"
            className="text-sm font-semibold"
          >
            Note{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>

          <input
            id="payment-note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. DuitNow transfer"
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="mt-5 h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white/60"
        >
          {saving
            ? "Saving..."
            : requiresConfirmation
              ? "Submit Payment"
              : "Record Payment"}
        </button>
      </div>
    </div>
  );
}
