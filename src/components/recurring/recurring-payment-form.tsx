"use client";

import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PaymentTransferDetails } from "@/components/payments/payment-transfer-details";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { buildPaymentReference } from "@/lib/payment-transfer";
import { monthLabels, sumSelectedPeriods } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/client";

type PayablePeriod = {
  id: string;
  periodStart: string;
  dueDate: string;
  shareAmount: number;
};

type RecurringPaymentFormProps = {
  arrangementId: string;
  fromPersonId: string;
  personName: string;
  periods: PayablePeriod[];
  requiresConfirmation: boolean;
  arrangementName: string;
  payerName: string;
  receiverPaymentQrPath: string | null;
  mode: "mark-paid" | "record-received";
  onClose: () => void;
};

export function RecurringPaymentForm({
  arrangementId,
  fromPersonId,
  personName,
  periods,
  requiresConfirmation,
  arrangementName,
  payerName,
  receiverPaymentQrPath,
  mode,
  onClose,
}: RecurringPaymentFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const online = useOnlineStatus();
  const [selected, setSelected] = useState<string[]>(periods[0] ? [periods[0].id] : []);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = sumSelectedPeriods(periods, selected);
  const selectedPeriodLabel = periods
    .filter((period) => selected.includes(period.id))
    .map((period) => {
      const date = new Date(`${period.periodStart}T00:00:00Z`);
      return `${monthLabels[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    })
    .join(", ");

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function save() {
    if (!navigator.onLine) {
      setError("You’re offline. Reconnect before recording this payment.");
      return;
    }

    if (!selected.length || saving) return;
    setSaving(true);
    setError("");
    const { error: saveError } = await supabase.rpc("record_recurring_payment", {
      p_arrangement_id: arrangementId,
      p_from_person_id: fromPersonId,
      p_period_ids: selected,
      p_note: note.trim(),
    });
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60">
      <button type="button" aria-label="Close payment form" onClick={onClose} className="absolute inset-0" />
      <div className="relative z-10 max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-white/[0.08] bg-background px-5 pb-8 pt-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{mode === "mark-paid" ? "Record payment for several months" : `Record payment from ${personName}`}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select every month covered by this payment.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"><X className="size-4" /></button>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          {periods.map((period, index) => {
            const date = new Date(`${period.periodStart}T00:00:00Z`);
            const checked = selected.includes(period.id);
            return (
              <button key={period.id} type="button" onClick={() => toggle(period.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${index < periods.length - 1 ? "border-b border-white/[0.06]" : ""}`}>
                <span className={`flex size-6 items-center justify-center rounded-full border ${checked ? "border-blue-500 bg-blue-600 text-white" : "border-white/15 text-transparent"}`}><Check className="size-4" /></span>
                <span className="min-w-0 flex-1 text-sm font-medium">{monthLabels[date.getUTCMonth()]} {date.getUTCFullYear()}</span>
                <span className="text-sm font-semibold">RM {period.shareAmount.toFixed(2)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl bg-blue-500/[0.08] px-4 py-3">
          <div className="flex items-center justify-between gap-3"><span className="text-sm text-blue-200">{selected.length} month{selected.length === 1 ? "" : "s"} selected</span><span className="font-bold text-blue-200">RM {total.toFixed(2)}</span></div>
        </div>
        {requiresConfirmation && <p className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">This only records the payment in SplitHutang. {payerName} must confirm they received it before these months are marked as paid.</p>}
        {mode === "mark-paid" && (
          <PaymentTransferDetails
            amount={total}
            reference={buildPaymentReference({
              kind: "recurring",
              transactionName: arrangementName,
              qualifier: selectedPeriodLabel,
            })}
            receiverPaymentQrPath={receiverPaymentQrPath}
            receiverName={payerName}
          />
        )}
        {!online && <p role="alert" className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">You’re offline. You can still copy payment details or save a loaded QR, but reconnect before recording the payment.</p>}
        <label htmlFor="recurring-payment-note" className="mt-4 block text-sm font-semibold">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="recurring-payment-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. DuitNow transfer" className="form-input mt-2" />
        {error && <p className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
        <button type="button" disabled={!selected.length || saving || !online} onClick={save} className="mt-5 h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : mode === "mark-paid" ? "I’ve paid these months" : "Mark as received"}</button>
      </div>
    </div>
  );
}
