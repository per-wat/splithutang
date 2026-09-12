"use client";

import { useState } from "react";

import { RecordPaymentForm } from "./record-payment-form";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type ExpenseParticipantRowProps = {
  expenseId: string;

  person: {
    id: string;
    name: string;
    initial: string;
    color: string;
    avatarPath: string | null;
  };

  shareAmount: number;
  paidAmount: number;
  pendingAmount: number;
  remaining: number;
  availableToSubmit: number;

  isPayer: boolean;
  canRecordPayment: boolean;
  requiresConfirmation: boolean;
  paymentMode: "mark-paid" | "record-received";
  receiverName: string;
};

export function ExpenseParticipantRow({
  expenseId,
  person,
  shareAmount,
  paidAmount,
  pendingAmount,
  remaining,
  availableToSubmit,
  isPayer,
  canRecordPayment,
  requiresConfirmation,
  paymentMode,
  receiverName,
}: ExpenseParticipantRowProps) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const settled = !isPayer && remaining <= 0;

  return (
    <>
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <ProfileAvatar
            name={person.name}
            avatarColor={person.color}
            avatarPath={person.avatarPath}
            className="size-10 text-sm"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{person.name}</p>

                {isPayer ? (
                  <p className="mt-0.5 text-xs text-blue-400">
                    Paid for the expense
                  </p>
                ) : settled ? (
                  <p className="mt-0.5 text-xs text-emerald-400">
                    Fully paid
                  </p>
                ) : pendingAmount > 0 ? (
                  <p className="mt-0.5 text-xs text-amber-400">
                    Waiting for confirmation
                  </p>
                ) : paidAmount > 0 ? (
                  <p className="mt-0.5 text-xs text-amber-400">
                    Partly paid
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-red-400">Not paid yet</p>
                )}
              </div>

              <p className="shrink-0 font-bold">RM {shareAmount.toFixed(2)}</p>
            </div>

            {!isPayer && (
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="space-y-1 text-xs text-muted-foreground">
                  {paidAmount > 0 && (
                    <p>Paid and confirmed: RM {paidAmount.toFixed(2)}</p>
                  )}

                  {pendingAmount > 0 && (
                    <p className="text-amber-400">
                      Waiting for confirmation: RM {pendingAmount.toFixed(2)}
                    </p>
                  )}

                  <p>
                    Still to pay:{" "}
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

                {canRecordPayment && availableToSubmit > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(true)}
                    className="shrink-0 rounded-xl bg-blue-600/10 px-3 py-2 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-600/20"
                  >
                    {paymentMode === "mark-paid"
                      ? "I’ve paid"
                      : "Mark as received"}
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
          availableToSubmit={availableToSubmit}
          requiresConfirmation={requiresConfirmation}
          paymentMode={paymentMode}
          receiverName={receiverName}
          onClose={() => setShowPaymentForm(false)}
        />
      )}
    </>
  );
}
