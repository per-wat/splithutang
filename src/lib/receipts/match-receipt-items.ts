import type {
  ReceiptItemCandidateAnalysis,
  ReceiptPerUnitCandidate,
} from "@/lib/receipts/extract-receipt-item-candidates";

import type { FusedReceiptPriceCandidate } from "@/lib/receipts/fuse-receipt-price-candidates";

import type { ReceiptNameGroup } from "@/lib/receipts/group-receipt-name-candidates";

import type { ParsedReceiptSummary } from "@/lib/receipts/parse-receipt-summary";

export type ReceiptItemAmountSource =
  | "right-column"
  | "per-unit-fallback"
  | null;

export type MatchedReceiptItem = {
  sequence: number;
  name: string;
  quantity: number;
  amount: number | null;
  amountSource: ReceiptItemAmountSource;
  confidence: number;
  isPossibleAddon: boolean;
  parentSequence: number | null;
  nameRows: number[];
  priceSequence: number | null;
  needsReview: boolean;
  reviewReasons: string[];
};

export type ReceiptItemMatchResult = {
  items: MatchedReceiptItem[];
  calculatedItemTotal: number;
  expectedAmount: number | null;
  expectedAmountSource: "subtotal" | "total" | null;
  difference: number | null;
  unmatchedPriceSequences: number[];
  warnings: string[];
};

type PriceAssignments = {
  groupToPrice: Map<number, number>;
  usedPriceIndexes: Set<number>;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sumPrices(prices: FusedReceiptPriceCandidate[]) {
  return roundMoney(prices.reduce((total, price) => total + price.amount, 0));
}

function selectPriceCandidates(
  fusedPrices: FusedReceiptPriceCandidate[],
  expectedAmount: number | null,
) {
  if (expectedAmount === null) {
    return fusedPrices;
  }

  /*
   * Cross-pass fusion deliberately preserves prices that appear in only one
   * OCR pass. That recovers missing prices on receipts such as Receipt 2, but
   * it can also retain false positives from the alternate passes.
   *
   * When the structured-backed subsequence already reconciles with the
   * receipt subtotal/total, it is complete enough on its own and is safer
   * than the longer fused supersequence. Receipt 4 is the important case:
   * the structured pass has the eight correct prices, while alternate passes
   * add three false prices and break one-to-one ordered matching.
   */
  const structuredPrices = fusedPrices.filter((price) =>
    price.evidence.some((evidence) => evidence.pass === "structured"),
  );

  if (structuredPrices.length === 0) {
    return fusedPrices;
  }

  const structuredDifference = roundMoney(
    sumPrices(structuredPrices) - expectedAmount,
  );

  if (Math.abs(structuredDifference) <= 0.02) {
    return structuredPrices;
  }

  return fusedPrices;
}

function findExpectedAmount(summary: ParsedReceiptSummary) {
  if (summary.subtotal) {
    return {
      amount: summary.subtotal.value,
      source: "subtotal" as const,
    };
  }

  const hasAdjustment = [
    summary.serviceCharge?.value,
    summary.tax?.value,
    summary.rounding?.value,
  ].some((value) => typeof value === "number" && Math.abs(value) >= 0.01);

  if (!hasAdjustment && summary.total) {
    return {
      amount: summary.total.value,
      source: "total" as const,
    };
  }

  return {
    amount: null,
    source: null,
  };
}

function findStructuredEvidenceRows(price: FusedReceiptPriceCandidate) {
  return price.evidence
    .filter((evidence) => evidence.pass === "structured")
    .map((evidence) => evidence.rowNumber);
}

function assignFusedPrices(
  groups: ReceiptNameGroup[],
  prices: FusedReceiptPriceCandidate[],
): PriceAssignments {
  const groupToPrice = new Map<number, number>();
  const usedPriceIndexes = new Set<number>();

  /*
   * When counts agree, ordered matching is the strongest
   * evidence. This handles Receipt 4, where the printed
   * price is vertically shifted relative to its item name.
   */
  if (groups.length > 0 && groups.length === prices.length) {
    groups.forEach((_group, index) => {
      groupToPrice.set(index, index);
      usedPriceIndexes.add(index);
    });

    return {
      groupToPrice,
      usedPriceIndexes,
    };
  }

  /*
   * When counts differ, use exact structured-pass row
   * evidence. This correctly maps Receipt 1 main items
   * while leaving unpriced add-ons unmatched.
   */
  prices.forEach((price, priceIndex) => {
    const structuredRows = findStructuredEvidenceRows(price);

    if (structuredRows.length === 0) {
      return;
    }

    const matchingGroupIndexes = groups
      .map((group, groupIndex) => ({
        group,
        groupIndex,
      }))
      .filter(({ group, groupIndex }) => {
        if (groupToPrice.has(groupIndex)) {
          return false;
        }

        return structuredRows.some((rowNumber) =>
          group.rows.includes(rowNumber),
        );
      })
      .map(({ groupIndex }) => groupIndex);

    if (matchingGroupIndexes.length !== 1) {
      return;
    }

    const groupIndex = matchingGroupIndexes[0];

    if (groupIndex === undefined) {
      return;
    }

    groupToPrice.set(groupIndex, priceIndex);
    usedPriceIndexes.add(priceIndex);
  });

  /*
   * Only perform ordered fallback when all remaining
   * prices and non-add-on groups have equal counts.
   */
  const remainingPriceIndexes = prices
    .map((_price, index) => index)
    .filter((index) => !usedPriceIndexes.has(index));

  const remainingGroupIndexes = groups
    .map((_group, index) => index)
    .filter(
      (index) =>
        !groupToPrice.has(index) && groups[index]?.isPossibleAddon === false,
    );

  if (
    remainingPriceIndexes.length > 0 &&
    remainingPriceIndexes.length === remainingGroupIndexes.length
  ) {
    remainingGroupIndexes.forEach((groupIndex, index) => {
      const priceIndex = remainingPriceIndexes[index];

      if (priceIndex === undefined) {
        return;
      }

      groupToPrice.set(groupIndex, priceIndex);
      usedPriceIndexes.add(priceIndex);
    });
  }

  return {
    groupToPrice,
    usedPriceIndexes,
  };
}

function findPerUnitFallback(
  group: ReceiptNameGroup,
  candidates: ReceiptPerUnitCandidate[],
) {
  const firstRow = Math.min(...group.rows);
  const lastRow = Math.max(...group.rows);

  const overlappingCandidates = candidates.filter(
    (candidate) =>
      candidate.startRow <= lastRow && candidate.endRow >= firstRow,
  );

  if (overlappingCandidates.length !== 1) {
    return null;
  }

  return overlappingCandidates[0] ?? null;
}

export function matchReceiptItems(
  groups: ReceiptNameGroup[],
  fusedPrices: FusedReceiptPriceCandidate[],
  candidateAnalysis: ReceiptItemCandidateAnalysis,
  summary: ParsedReceiptSummary,
): ReceiptItemMatchResult {
  const warnings: string[] = [];

  const expected = findExpectedAmount(summary);
  const selectedPrices = selectPriceCandidates(fusedPrices, expected.amount);

  const assignments = assignFusedPrices(groups, selectedPrices);

  const items: MatchedReceiptItem[] = [];

  let latestMainItemSequence: number | null = null;

  groups.forEach((group, groupIndex) => {
    const sequence = groupIndex + 1;

    const assignedPriceIndex = assignments.groupToPrice.get(groupIndex);

    const assignedPrice =
      assignedPriceIndex === undefined
        ? null
        : (selectedPrices[assignedPriceIndex] ?? null);

    /*
     * Per-unit evidence is only considered when no fused
     * right-column price was assigned.
     */
    const perUnitFallback =
      !assignedPrice && !group.isPossibleAddon
        ? findPerUnitFallback(group, candidateAnalysis.perUnitCandidates)
        : null;

    let amount: number | null = null;
    let amountSource: ReceiptItemAmountSource = null;
    let amountConfidence = 0;
    let priceSequence: number | null = null;

    if (assignedPrice) {
      amount = assignedPrice.amount;
      amountSource = "right-column";
      amountConfidence = assignedPrice.confidence;
      priceSequence = assignedPrice.sequence;
    } else if (perUnitFallback) {
      amount = perUnitFallback.amount;
      amountSource = "per-unit-fallback";
      amountConfidence = perUnitFallback.confidence;
    }

    const reviewReasons: string[] = [];

    if (group.confidence < 70) {
      reviewReasons.push("Item name has low OCR confidence.");
    }

    if (amount === null) {
      reviewReasons.push(
        group.isPossibleAddon
          ? "Add-on has no independent price evidence."
          : "Item price could not be detected.",
      );
    } else if (amountConfidence < 70) {
      reviewReasons.push("Item amount has low OCR confidence.");
    }

    if (amountSource === "per-unit-fallback") {
      reviewReasons.push("Amount was recovered from a printed per-unit value.");
    }

    let parentSequence: number | null = null;

    if (group.isPossibleAddon) {
      parentSequence = latestMainItemSequence;

      if (parentSequence === null) {
        reviewReasons.push("Add-on could not be linked to a preceding item.");
      }
    } else {
      latestMainItemSequence = sequence;
    }

    const confidence =
      amount === null
        ? group.confidence
        : Math.round((group.confidence + amountConfidence) / 2);

    items.push({
      sequence,
      name: group.text,
      quantity: group.quantityHint ?? 1,
      amount,
      amountSource,
      confidence,
      isPossibleAddon: group.isPossibleAddon,
      parentSequence,
      nameRows: group.rows,
      priceSequence,
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    });
  });

  const calculatedItemTotal = roundMoney(
    items.reduce((total, item) => total + (item.amount ?? 0), 0),
  );

  const difference =
    expected.amount === null
      ? null
      : roundMoney(calculatedItemTotal - expected.amount);

  if (
    difference !== null &&
    expected.source !== null &&
    Math.abs(difference) >= 0.01
  ) {
    warnings.push(
      `Detected item amounts differ from the ${expected.source} by RM${Math.abs(
        difference,
      ).toFixed(2)}.`,
    );
  }

  const itemsWithoutAmounts = items.filter((item) => item.amount === null);

  if (itemsWithoutAmounts.length > 0) {
    warnings.push(
      `${itemsWithoutAmounts.length} name group(s) have no independent price evidence.`,
    );
  }

  const unmatchedPriceSequences = selectedPrices
    .map((_price, index) => index)
    .filter((index) => !assignments.usedPriceIndexes.has(index))
    .map((index) => selectedPrices[index]?.sequence)
    .filter((sequence): sequence is number => sequence !== undefined);

  if (unmatchedPriceSequences.length > 0) {
    warnings.push(
      `${unmatchedPriceSequences.length} fused price(s) could not be matched.`,
    );
  }

  return {
    items,
    calculatedItemTotal,
    expectedAmount: expected.amount,
    expectedAmountSource: expected.source,
    difference,
    unmatchedPriceSequences,
    warnings,
  };
}
