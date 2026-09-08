import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReceiptReviewDraft,
  calculateReceiptReviewItemTotal,
  calculateReceiptReviewTotal,
  countUnacknowledgedReceiptReviewFields,
  getReceiptReviewFinalDifference,
  validateReceiptReviewDraft,
} from "../src/lib/receipts/build-receipt-review-draft.ts";
import type { ReceiptItemMatchResult } from "../src/lib/receipts/match-receipt-items.ts";
import type {
  ParsedReceiptField,
  ParsedReceiptSummary,
} from "../src/lib/receipts/parse-receipt-summary.ts";

function field<T>(value: T): ParsedReceiptField<T> {
  return {
    value,
    confidence: 95,
    sourceText: String(value),
    needsReview: false,
  };
}

function createSummary(
  overrides: Partial<ParsedReceiptSummary>,
): ParsedReceiptSummary {
  return {
    merchant: field("Test merchant"),
    receiptDate: field({ date: "2026-08-01", time: "16:06" }),
    subtotal: null,
    serviceCharge: null,
    tax: null,
    rounding: null,
    total: null,
    warnings: [],
    ...overrides,
  };
}

function createMatchResult(
  amounts: number[],
  expectedAmount: number,
): ReceiptItemMatchResult {
  const calculatedItemTotal = Math.round(
    amounts.reduce((sum, amount) => sum + amount, 0) * 100,
  ) / 100;

  return {
    items: amounts.map((amount, index) => ({
      sequence: index + 1,
      name: `Item ${index + 1}`,
      quantity: index === 0 ? 3 : 1,
      amount,
      amountSource: "right-column",
      confidence: 90,
      isPossibleAddon: false,
      parentSequence: null,
      nameRows: [index + 1],
      priceSequence: index + 1,
      needsReview: false,
      reviewReasons: [],
    })),
    calculatedItemTotal,
    expectedAmount,
    expectedAmountSource: "subtotal",
    difference: Math.round((calculatedItemTotal - expectedAmount) * 100) / 100,
    unmatchedPriceSequences: [],
    warnings: [],
  };
}

test("quantity does not multiply a printed line total", () => {
  const matchResult = createMatchResult([39.99], 39.99);
  const summary = createSummary({
    subtotal: field(39.99),
    total: field(39.99),
  });
  const draft = buildReceiptReviewDraft(summary, matchResult);

  assert.equal(draft.items[0]?.quantity, "3");
  assert.equal(calculateReceiptReviewItemTotal(draft), 39.99);
  assert.equal(calculateReceiptReviewTotal(draft), 39.99);
  assert.deepEqual(validateReceiptReviewDraft(draft), []);
});

test("known receipt charges reconcile subtotal to final total", () => {
  const matchResult = createMatchResult([77.84], 77.84);
  const summary = createSummary({
    subtotal: field(77.84),
    tax: field(4.67),
    rounding: field(-0.01),
    total: field(82.5),
  });
  const draft = buildReceiptReviewDraft(summary, matchResult);

  assert.equal(draft.tax.value, "4.67");
  assert.equal(draft.rounding.value, "-0.01");
  assert.equal(calculateReceiptReviewTotal(draft), 82.5);
  assert.equal(getReceiptReviewFinalDifference(draft), 0);
  assert.deepEqual(validateReceiptReviewDraft(draft), []);
});

test("a one-cent OCR residual becomes visible reviewed rounding", () => {
  const matchResult = createMatchResult([168.13, 12.88], 181);
  const summary = createSummary({ total: field(181) });
  const draft = buildReceiptReviewDraft(summary, matchResult);

  assert.equal(calculateReceiptReviewItemTotal(draft), 181.01);
  assert.equal(draft.rounding.value, "-0.01");
  assert.equal(draft.rounding.needsReview, true);
  assert.equal(calculateReceiptReviewTotal(draft), 181);
  assert.equal(getReceiptReviewFinalDifference(draft), 0);
  assert.equal(countUnacknowledgedReceiptReviewFields(draft), 1);
  assert.deepEqual(validateReceiptReviewDraft(draft), []);
});
