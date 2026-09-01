"use client";

import { useState } from "react";

import { RecordPaymentForm } from "./record-payment-form";

type ExpenseParticipantRowProps = {
  expenseId: string;

  person: {
    id: string;
    name: string;
    initial: string;
    color: string;
  };

  shareAmount: number;
  paidAmount: number;
  remaining: number;

  isPayer: boolean;
  canRecordPayment: boolean;
};

export function ExpenseParticipantRow({
  expenseId,
  person,
  shareAmount,
  paidAmount,
  remaining,
  isPayer,
  canRecordPayment,
}: ExpenseParticipantRowProps) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const settled = !isPayer && remaining <= 0;

  return (
    <>
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${person.color}`}
          >
            {person.initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{person.name}</p>

                {isPayer ? (
                  <p className="mt-0.5 text-xs text-blue-400">
                    Paid the expense
                  </p>
                ) : settled ? (
                  <p className="mt-0.5 text-xs text-emerald-400">Settled</p>
                ) : paidAmount > 0 ? (
                  <p className="mt-0.5 text-xs text-amber-400">
                    Partially paid
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-red-400">Unpaid</p>
                )}
              </div>

              <p className="shrink-0 font-bold">RM {shareAmount.toFixed(2)}</p>
            </div>

            {!isPayer && (
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="space-y-1 text-xs text-muted-foreground">
                  {paidAmount > 0 && <p>Paid: RM {paidAmount.toFixed(2)}</p>}

                  <p>
                    Remaining:{" "}
                    <span
                      className={
                        remaining > 0
                          ? "font-semibold text-foreground"
                          : "text-emerald-400"
                      }
                    >
                      RM {remaining.toFixed(2)}
                    </span>
                  </p>
                </div>

                {canRecordPayment && remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(true)}
                    className="shrink-0 rounded-xl bg-blue-600/10 px-3 py-2 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-600/20"
                  >
                    Record Payment
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPaymentForm && (
        <RecordPaymentForm
          expenseId={expenseId}
          personId={person.id}
          personName={person.name}
          remaining={remaining}
          onClose={() => setShowPaymentForm(false)}
        />
      )}
    </>
  );
}
