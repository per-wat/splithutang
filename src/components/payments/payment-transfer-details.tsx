"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { PaymentQrPanel } from "@/components/payments/payment-qr-panel";
import { formatPaymentAmountForClipboard } from "@/lib/payment-transfer";

type CopyTarget = "amount" | "reference";

type CopyFeedback = {
  target: CopyTarget;
  type: "success" | "error";
  message: string;
};

type PaymentTransferDetailsProps = {
  amount: number;
  reference: string;
  receiverName: string;
  receiverPaymentQrPath: string | null;
};

export function PaymentTransferDetails({
  amount,
  reference,
  receiverName,
  receiverPaymentQrPath,
}: PaymentTransferDetailsProps) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const amountToCopy = formatPaymentAmountForClipboard(amount);

  async function copyValue(
    target: CopyTarget,
    value: string,
    successMessage: string,
  ) {
    setFeedback(null);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable");
      }

      await navigator.clipboard.writeText(value);
      setFeedback({ target, type: "success", message: successMessage });
    } catch (error) {
      console.error(`Unable to copy payment ${target}:`, error);
      setFeedback({
        target,
        type: "error",
        message: `Couldn’t copy the ${target}. Select and copy it manually.`,
      });
    }
  }

  return (
    <>
      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div>
          <h3 className="text-sm font-bold">Payment details</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Copy these details into your bank transfer before marking it paid.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <CopyRow
            label="Amount"
            value={`RM ${amountToCopy}`}
            copied={feedback?.target === "amount" && feedback.type === "success"}
            disabled={amount <= 0}
            onCopy={() =>
              copyValue(
                "amount",
                amountToCopy,
                `Amount RM ${amountToCopy} copied.`,
              )
            }
          />

          <CopyRow
            label="Payment reference"
            value={reference}
            copied={
              feedback?.target === "reference" && feedback.type === "success"
            }
            onCopy={() =>
              copyValue(
                "reference",
                reference,
                "Payment reference copied.",
              )
            }
          />
        </div>

        {feedback && (
          <p
            role="status"
            aria-live="polite"
            className={`mt-3 text-xs ${
              feedback.type === "success"
                ? "text-emerald-300"
                : "text-red-300"
            }`}
          >
            {feedback.message}
          </p>
        )}
      </section>

      <PaymentQrPanel
        paymentQrPath={receiverPaymentQrPath}
        receiverName={receiverName}
      />
    </>
  );
}

function CopyRow({
  label,
  value,
  copied,
  disabled = false,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  disabled?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/15 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 select-all break-words text-sm font-semibold">
          {value}
        </p>
      </div>

      <button
        type="button"
        onClick={onCopy}
        disabled={disabled}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-blue-300 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
