"use client";

import { useState } from "react";

import { RecordIouPaymentForm } from "./record-iou-payment-form";

type IouPaymentActionProps = {
  iouId: string;
  debtorName: string;
  creditorName: string;
  remaining: number;
  availableToSubmit: number;
  requiresConfirmation: boolean;
};

export function IouPaymentAction({
  iouId,
  debtorName,
  creditorName,
  remaining,
  availableToSubmit,
  requiresConfirmation,
}: IouPaymentActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.99]"
      >
        {requiresConfirmation ? "Submit Payment" : "Record Payment"}
      </button>

      {open && (
        <RecordIouPaymentForm
          iouId={iouId}
          debtorName={debtorName}
          creditorName={creditorName}
          remaining={remaining}
          availableToSubmit={availableToSubmit}
          requiresConfirmation={requiresConfirmation}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
