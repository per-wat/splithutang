import type { ReceiptItemMatchResult } from "@/lib/receipts/match-receipt-items";
import type {
  ParsedReceiptField,
  ParsedReceiptSummary,
} from "@/lib/receipts/parse-receipt-summary";

export type ReceiptReviewField = {
  value: string;
  needsReview: boolean;
  acknowledged: boolean;
};

export type ReceiptReviewItemKind = "item" | "addon";

export type ReceiptReviewDraftItem = {
  id: string;
  sourceSequence: number | null;
  name: string;
  quantity: string;
  amount: string;
  kind: ReceiptReviewItemKind;
  parentId: string | null;
  confidence: number | null;
  needsReview: boolean;
  acknowledged: boolean;
  reviewReasons: string[];
};

export type ReceiptReviewDraft = {
  merchant: ReceiptReviewField;
  receiptDate: ReceiptReviewField;
  receiptTime: ReceiptReviewField;
  expectedAmount: ReceiptReviewField;
  expectedAmountSource: "subtotal" | "total" | null;
  serviceCharge: ReceiptReviewField;
  tax: ReceiptReviewField;
  rounding: ReceiptReviewField;
  total: ReceiptReviewField;
  items: ReceiptReviewDraftItem[];
};

export type ReceiptReviewIssue = {
  code:
    | "merchant-required"
    | "date-required"
    | "expected-amount-required"
    | "service-charge-invalid"
    | "tax-invalid"
    | "rounding-invalid"
    | "total-required"
    | "receipt-total-mismatch"
    | "item-required"
    | "item-name-required"
    | "item-quantity-invalid"
    | "item-amount-invalid"
    | "addon-parent-required"
    | "total-mismatch";
  message: string;
  itemId?: string;
};

function formatMoney(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}

function buildTextField(field: ParsedReceiptField<string> | null) {
  const needsReview = field === null || field.needsReview;

  return {
    value: field?.value ?? "",
    needsReview,
    acknowledged: !needsReview,
  } satisfies ReceiptReviewField;
}

function buildDateField(summary: ParsedReceiptSummary) {
  const needsReview =
    summary.receiptDate === null || summary.receiptDate.needsReview;

  return {
    value: summary.receiptDate?.value.date ?? "",
    needsReview,
    acknowledged: !needsReview,
  } satisfies ReceiptReviewField;
}

function buildTimeField(summary: ParsedReceiptSummary) {
  const missingTime = !summary.receiptDate?.value.time;
  const needsReview =
    summary.receiptDate === null ||
    summary.receiptDate.needsReview ||
    missingTime;

  return {
    value: summary.receiptDate?.value.time ?? "",
    needsReview,
    acknowledged: !needsReview,
  } satisfies ReceiptReviewField;
}

function buildExpectedAmountField(matchResult: ReceiptItemMatchResult) {
  const needsReview = matchResult.expectedAmount === null;

  return {
    value: formatMoney(matchResult.expectedAmount),
    needsReview,
    acknowledged: !needsReview,
  } satisfies ReceiptReviewField;
}

function buildOptionalMoneyField(field: ParsedReceiptField<number> | null) {
  return {
    value: formatMoney(field?.value ?? 0),
    needsReview: field?.needsReview ?? false,
    acknowledged: !field?.needsReview,
  } satisfies ReceiptReviewField;
}

function buildTotalField(
  summary: ParsedReceiptSummary,
  fallbackTotal: number,
) {
  const needsReview = summary.total === null || summary.total.needsReview;

  return {
    value: formatMoney(summary.total?.value ?? fallbackTotal),
    needsReview,
    acknowledged: !needsReview,
  } satisfies ReceiptReviewField;
}

export function buildReceiptReviewDraft(
  summary: ParsedReceiptSummary,
  matchResult: ReceiptItemMatchResult,
): ReceiptReviewDraft {
  const itemIdBySequence = new Map(
    matchResult.items.map((item) => [
      item.sequence,
      `receipt-item-${item.sequence}`,
    ]),
  );

  const serviceCharge = summary.serviceCharge?.value ?? 0;
  const tax = summary.tax?.value ?? 0;
  const detectedRounding = summary.rounding?.value ?? 0;
  const finalTotal =
    summary.total?.value ??
    matchResult.calculatedItemTotal + serviceCharge + tax + detectedRounding;
  const balancingRounding = Math.round(
    (finalTotal - matchResult.calculatedItemTotal - serviceCharge - tax) * 100,
  ) / 100;
  const roundingDiffersFromDetected =
    Math.abs(balancingRounding - detectedRounding) >= 0.01;
  const useBalancingRounding =
    summary.total !== null &&
    Math.abs(balancingRounding - detectedRounding) <= 0.02;
  const rounding = useBalancingRounding
    ? balancingRounding
    : detectedRounding;
  const roundingNeedsReview =
    summary.rounding?.needsReview === true ||
    (summary.rounding === null && roundingDiffersFromDetected);

  return {
    merchant: buildTextField(summary.merchant),
    receiptDate: buildDateField(summary),
    receiptTime: buildTimeField(summary),
    expectedAmount: buildExpectedAmountField(matchResult),
    expectedAmountSource: matchResult.expectedAmountSource,
    serviceCharge: buildOptionalMoneyField(summary.serviceCharge),
    tax: buildOptionalMoneyField(summary.tax),
    rounding: {
      value: formatMoney(rounding),
      needsReview: roundingNeedsReview,
      acknowledged: !roundingNeedsReview,
    },
    total: buildTotalField(summary, finalTotal),
    items: matchResult.items.map((item) => ({
      id:
        itemIdBySequence.get(item.sequence) ?? `receipt-item-${item.sequence}`,
      sourceSequence: item.sequence,
      name: item.name,
      quantity: String(item.quantity),
      amount: formatMoney(item.amount),
      kind: item.isPossibleAddon ? "addon" : "item",
      parentId:
        item.parentSequence === null
          ? null
          : (itemIdBySequence.get(item.parentSequence) ?? null),
      confidence: item.confidence,
      needsReview: item.needsReview,
      acknowledged: !item.needsReview,
      reviewReasons: item.reviewReasons,
    })),
  };
}

export function parseReceiptReviewMoney(value: string) {
  const normalizedValue = value
    .trim()
    .replace(/^RM\s*/i, "")
    .replace(",", ".");

  if (!/^-?\d{1,7}(?:\.\d{1,2})?$/.test(normalizedValue)) {
    return null;
  }

  const amount = Number(normalizedValue);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function parseNonnegativeMoney(value: string) {
  const amount = parseReceiptReviewMoney(value);

  return amount !== null && amount >= 0 ? amount : null;
}

export function calculateReceiptReviewItemTotal(draft: ReceiptReviewDraft) {
  const total = draft.items.reduce((sum, item) => {
    const amount = parseReceiptReviewMoney(item.amount);

    return sum + (amount ?? 0);
  }, 0);

  return Math.round(total * 100) / 100;
}

export function getReceiptReviewDifference(draft: ReceiptReviewDraft) {
  const expectedAmount = parseReceiptReviewMoney(draft.expectedAmount.value);

  if (expectedAmount === null) {
    return null;
  }

  return (
    Math.round(
      (calculateReceiptReviewItemTotal(draft) - expectedAmount) * 100,
    ) / 100
  );
}

export function calculateReceiptReviewTotal(draft: ReceiptReviewDraft) {
  const serviceCharge = parseNonnegativeMoney(draft.serviceCharge.value) ?? 0;
  const tax = parseNonnegativeMoney(draft.tax.value) ?? 0;
  const rounding = parseReceiptReviewMoney(draft.rounding.value) ?? 0;

  return Math.round(
    (calculateReceiptReviewItemTotal(draft) + serviceCharge + tax + rounding) *
      100,
  ) / 100;
}

export function getReceiptReviewFinalDifference(draft: ReceiptReviewDraft) {
  const finalTotal = parseNonnegativeMoney(draft.total.value);

  if (finalTotal === null) {
    return null;
  }

  return Math.round((calculateReceiptReviewTotal(draft) - finalTotal) * 100) / 100;
}

export function validateReceiptReviewDraft(draft: ReceiptReviewDraft) {
  const issues: ReceiptReviewIssue[] = [];

  if (!draft.merchant.value.trim()) {
    issues.push({
      code: "merchant-required",
      message: "Enter the merchant name.",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.receiptDate.value.trim())) {
    issues.push({
      code: "date-required",
      message: "Enter a valid receipt date.",
    });
  }

  if (parseReceiptReviewMoney(draft.expectedAmount.value) === null) {
    issues.push({
      code: "expected-amount-required",
      message: "Enter the receipt subtotal or item-total target.",
    });
  }

  if (parseNonnegativeMoney(draft.serviceCharge.value) === null) {
    issues.push({
      code: "service-charge-invalid",
      message: "Enter a valid service charge.",
    });
  }

  if (parseNonnegativeMoney(draft.tax.value) === null) {
    issues.push({
      code: "tax-invalid",
      message: "Enter a valid tax amount.",
    });
  }

  if (parseReceiptReviewMoney(draft.rounding.value) === null) {
    issues.push({
      code: "rounding-invalid",
      message: "Enter a valid rounding adjustment.",
    });
  }

  const finalTotal = parseNonnegativeMoney(draft.total.value);

  if (finalTotal === null || finalTotal <= 0) {
    issues.push({
      code: "total-required",
      message: "Enter a valid final receipt total.",
    });
  }

  if (!draft.items.some((item) => item.kind === "item")) {
    issues.push({
      code: "item-required",
      message: "Add at least one main item.",
    });
  }

  const mainItemIds = new Set(
    draft.items.filter((item) => item.kind === "item").map((item) => item.id),
  );

  for (const item of draft.items) {
    if (!item.name.trim()) {
      issues.push({
        code: "item-name-required",
        itemId: item.id,
        message: "Enter an item name.",
      });
    }

    const quantity = Number(item.quantity);

    if (
      !/^\d+$/.test(item.quantity.trim()) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      issues.push({
        code: "item-quantity-invalid",
        itemId: item.id,
        message: `Enter a valid quantity for ${item.name.trim() || "this item"}.`,
      });
    }

    const amount = parseNonnegativeMoney(item.amount);
    const blankIncludedAddon =
      item.kind === "addon" && item.amount.trim() === "";

    if (amount === null && !blankIncludedAddon) {
      issues.push({
        code: "item-amount-invalid",
        itemId: item.id,
        message: `Enter a valid line total for ${item.name.trim() || "this item"}.`,
      });
    }

    if (
      item.kind === "addon" &&
      (item.parentId === null || !mainItemIds.has(item.parentId))
    ) {
      issues.push({
        code: "addon-parent-required",
        itemId: item.id,
        message: `Choose a parent item for ${item.name.trim() || "this add-on"}.`,
      });
    }
  }

  const difference = getReceiptReviewDifference(draft);

  if (difference !== null && Math.abs(difference) > 0.02) {
    issues.push({
      code: "total-mismatch",
      message: `Item totals differ from the target by RM${Math.abs(difference).toFixed(2)}.`,
    });
  }

  const finalDifference = getReceiptReviewFinalDifference(draft);

  if (finalDifference !== null && Math.abs(finalDifference) >= 0.01) {
    issues.push({
      code: "receipt-total-mismatch",
      message: `Subtotal and adjustments differ from the final total by RM${Math.abs(
        finalDifference,
      ).toFixed(2)}.`,
    });
  }

  return issues;
}

export function countUnacknowledgedReceiptReviewFields(
  draft: ReceiptReviewDraft,
) {
  const summaryFields = [
    draft.merchant,
    draft.receiptDate,
    draft.receiptTime,
    draft.expectedAmount,
    draft.serviceCharge,
    draft.tax,
    draft.rounding,
    draft.total,
  ];

  const summaryCount = summaryFields.filter(
    (field) => field.needsReview && !field.acknowledged,
  ).length;

  const itemCount = draft.items.filter(
    (item) => item.needsReview && !item.acknowledged,
  ).length;

  return summaryCount + itemCount;
}
