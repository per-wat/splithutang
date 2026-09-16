"use client";

import { useState } from "react";

import type { RecurringPeriod } from "@/lib/recurring";

import { RecurringPaymentForm } from "./recurring-payment-form";

type Props = {
  arrangementId: string;
  personId: string;
  personName: string;
  payerName: string;
  receiverPaymentQrPath: string | null;
  periods: RecurringPeriod[];
  requiresConfirmation: boolean;
  mode: "mark-paid" | "record-received";
};

export function RecurringObligationAction(props: Props) {
  const [open, setOpen] = useState(false);
  const payable = props.periods.flatMap((period) => {
    if (period.state !== "open") return [];
    const obligation = period.obligations.find((item) => item.personId === props.personId && item.paymentStatus === "unpaid");
    return obligation ? [{ id: period.id, periodStart: period.periodStart, dueDate: period.dueDate, shareAmount: obligation.shareAmount }] : [];
  });
  if (!payable.length) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
        {props.mode === "mark-paid" ? "I’ve paid" : "Mark as received"}
      </button>
      {open && <RecurringPaymentForm arrangementId={props.arrangementId} fromPersonId={props.personId} personName={props.personName} periods={payable} requiresConfirmation={props.requiresConfirmation} payerName={props.payerName} receiverPaymentQrPath={props.receiverPaymentQrPath} mode={props.mode} onClose={() => setOpen(false)} />}
    </>
  );
}
