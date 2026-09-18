export type PaymentReferenceKind = "expense" | "iou" | "recurring";

const referenceKindLabels: Record<PaymentReferenceKind, string> = {
  expense: "Expense",
  iou: "Hutang",
  recurring: "Recurring",
};

const MAX_REFERENCE_LENGTH = 80;

function cleanReferencePart(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildPaymentReference({
  kind,
  transactionName,
  qualifier,
}: {
  kind: PaymentReferenceKind;
  transactionName: string;
  qualifier?: string;
}) {
  const parts = [
    "SplitHutang",
    referenceKindLabels[kind],
    cleanReferencePart(transactionName),
    qualifier ? cleanReferencePart(qualifier) : "",
  ].filter(Boolean);

  const reference = parts.join(" - ");

  if (reference.length <= MAX_REFERENCE_LENGTH) {
    return reference;
  }

  return `${reference.slice(0, MAX_REFERENCE_LENGTH - 3).trimEnd()}...`;
}

export function formatPaymentAmountForClipboard(amount: number) {
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : "0.00";
}
