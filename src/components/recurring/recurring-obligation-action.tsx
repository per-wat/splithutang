"use client";

import { useHistoryOverlay } from "@/hooks/use-history-overlay";
import type { RecurringPeriod } from "@/lib/recurring";

import { RecurringPaymentForm } from "./recurring-payment-form";

type Props = {
  arrangementId: string;
  personId: string;
  personName: string;
  arrangementName: string;
  payerName: string;
  receiverPaymentQrPath: string | null;
  periods: RecurringPeriod[];
  requiresConfirmation: boolean;
  mode: "mark-paid" | "record-received";
};

export function RecurringObligationAction(props: Props) {
  const { open, openOverlay, dismiss } = useHistoryOverlay(
    "recurring-payment-sheet",
  );
  const payable = props.periods.flatMap((period) => {
    if (period.state !== "open") return [];
    const obligation = period.obligations.find((item) => item.personId === props.personId && item.paymentStatus === "unpaid");
    return obligation ? [{ id: period.id, periodStart: period.periodStart, dueDate: period.dueDate, shareAmount: obligation.shareAmount }] : [];
  });
  if (!payable.length) return null;

  return (
    <>
      <button type="button" onClick={openOverlay} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
        {props.mode === "mark-paid" ? "I’ve paid" : "Mark as received"}
      </button>
      {open && <RecurringPaymentForm arrangementId={props.arrangementId} arrangementName={props.arrangementName} fromPersonId={props.personId} personName={props.personName} periods={payable} requiresConfirmation={props.requiresConfirmation} payerName={props.payerName} receiverPaymentQrPath={props.receiverPaymentQrPath} mode={props.mode} onClose={dismiss} />}
    </>
  );
}
