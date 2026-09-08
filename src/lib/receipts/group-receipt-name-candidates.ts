import type {
  ReceiptItemCandidateAnalysis,
  ReceiptNameCandidate,
} from "@/lib/receipts/extract-receipt-item-candidates";

export type ReceiptNameGroup = {
  sequence: number;
  rows: number[];
  text: string;
  confidence: number;
  quantityHint: number | null;
  isPossibleAddon: boolean;
  structuredPriceRows: number[];
};

type InternalNameGroup = {
  candidates: ReceiptNameCandidate[];
  firstRow: number;
  lastRow: number;
};

function countLetters(text: string) {
  return text.match(/[a-z]/gi)?.length ?? 0;
}

function averageConfidence(candidates: ReceiptNameCandidate[]) {
  if (candidates.length === 0) {
    return 0;
  }

  const total = candidates.reduce(
    (sum, candidate) => sum + candidate.confidence,
    0,
  );

  return Math.round(total / candidates.length);
}

function getQuantityHint(text: string) {
  /*
   * Common restaurant format:
   * "SP Poison Ivy 2"
   */
  const trailingMatch = text.match(/\s([1-9]\d?)[.)]?\s*$/);

  if (trailingMatch) {
    return Number(trailingMatch[1]);
  }

  /*
   * Common receipt format:
   * "1 R001 Beef Ramen"
   *
   * Require the following text to begin with an uppercase
   * character or opening bracket. This avoids interpreting
   * OCR text such as "4 ashed Potato" as quantity four.
   */
  const leadingMatch = text.match(/^[^a-zA-Z0-9]*([1-9]\d?)\s+(?=[A-Z([])/);

  if (leadingMatch) {
    return Number(leadingMatch[1]);
  }

  return null;
}

function looksLikePerUnitContinuation(text: string) {
  return /\d{1,6}(?:[.,]\d{1,2})\s*\/\s*e[a0o]\b/i.test(text);
}

function looksLikeShortModifier(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return ["iced", "ice", "hot", "cold"].includes(normalized);
}

function isExplicitItemStart(text: string) {
  if (getQuantityHint(text) !== null) {
    return true;
  }

  /*
   * OCR may drop the leading letter from product codes:
   * "G02 Taiwanese Sausage" becomes "02 Taiwanese Sausage".
   */
  if (/^[^a-zA-Z0-9]*0\d{1,3}\s+(?=[A-Z])/.test(text)) {
    return true;
  }

  return /^[^a-zA-Z0-9]*[A-Z]\d{2,4}\b/.test(text);
}

function isWeakGroup(group: InternalNameGroup) {
  const text = group.candidates.map((candidate) => candidate.text).join(" ");

  return (
    countLetters(text) < 10 &&
    averageConfidence(group.candidates) < 65 &&
    !group.candidates.some((candidate) => candidate.isPossibleAddon)
  );
}

function removeCertainEdgeNoise(
  candidates: ReceiptNameCandidate[],
  structuredPriceRows: Set<number>,
) {
  return candidates.filter((candidate, index) => {
    const isEdge = index === 0 || index === candidates.length - 1;

    if (!isEdge) {
      return true;
    }

    const isCertainNoise =
      candidate.confidence < 10 &&
      countLetters(candidate.text) < 8 &&
      !candidate.isPossibleAddon &&
      !structuredPriceRows.has(candidate.rowNumber);

    return !isCertainNoise;
  });
}

function createGroup(candidate: ReceiptNameCandidate): InternalNameGroup {
  return {
    candidates: [candidate],
    firstRow: candidate.rowNumber,
    lastRow: candidate.rowNumber,
  };
}

export function groupReceiptNameCandidates(
  analysis: ReceiptItemCandidateAnalysis,
  fusedPriceCount: number,
): ReceiptNameGroup[] {
  const structuredPriceRows = new Set(
    analysis.priceCandidates.map((candidate) => candidate.rowNumber),
  );

  const sortedCandidates = [...analysis.nameCandidates].sort(
    (first, second) => first.rowNumber - second.rowNumber,
  );

  const candidates = removeCertainEdgeNoise(
    sortedCandidates,
    structuredPriceRows,
  );

  /*
   * Grocery receipts often place the description on one row
   * and the quantity/final price on the following row.
   *
   * In this layout, trailing numbers in the description are
   * more likely product names or variants than quantities.
   */
  const alternatingPriceMatches = candidates.filter(
    (candidate) =>
      !structuredPriceRows.has(candidate.rowNumber) &&
      structuredPriceRows.has(candidate.rowNumber + 1),
  ).length;

  const usesAlternatingPriceRows =
    candidates.length > 0 && alternatingPriceMatches / candidates.length >= 0.7;

  /*
   * When name and fused-price counts already agree,
   * preserve every row as an independent item.
   *
   * This applies to Receipt 2 and Receipt 5 and avoids
   * making unnecessary grouping assumptions.
   */
  if (fusedPriceCount > 0 && candidates.length === fusedPriceCount) {
    return candidates.map((candidate, index) => ({
      sequence: index + 1,
      rows: [candidate.rowNumber],
      text: candidate.text,
      confidence: candidate.confidence,
      quantityHint:
        candidate.isPossibleAddon || usesAlternatingPriceRows
          ? null
          : getQuantityHint(candidate.text),
      isPossibleAddon: candidate.isPossibleAddon,
      structuredPriceRows: structuredPriceRows.has(candidate.rowNumber)
        ? [candidate.rowNumber]
        : [],
    }));
  }

  const groups: InternalNameGroup[] = [];

  for (const candidate of candidates) {
    const currentGroup = groups.length > 0 ? groups[groups.length - 1] : null;

    if (!currentGroup) {
      groups.push(createGroup(candidate));
      continue;
    }

    const rowGap = candidate.rowNumber - currentGroup.lastRow;

    const candidateHasPrice = structuredPriceRows.has(candidate.rowNumber);

    const previousRowHasPrice = structuredPriceRows.has(currentGroup.lastRow);

    const candidateLooksMeaningful = countLetters(candidate.text) >= 10;

    /*
     * Receipt 4 contains a damaged OCR row immediately
     * before the actual first item name. Retain its row
     * evidence but join it to the meaningful name.
     */
    const shouldJoinWeakPreviousGroup =
      rowGap === 1 && isWeakGroup(currentGroup) && candidateLooksMeaningful;

    let startsNewGroup = false;

    if (shouldJoinWeakPreviousGroup) {
      startsNewGroup = false;
    } else if (candidate.isPossibleAddon) {
      startsNewGroup = true;
    } else if (looksLikePerUnitContinuation(candidate.text)) {
      startsNewGroup = false;
    } else if (!candidateHasPrice && looksLikeShortModifier(candidate.text)) {
      startsNewGroup = false;
    } else if (isExplicitItemStart(candidate.text)) {
      startsNewGroup = true;
    } else if (candidateHasPrice) {
      startsNewGroup = true;
    } else if (previousRowHasPrice) {
      startsNewGroup = true;
    } else if (rowGap > 1) {
      startsNewGroup = true;
    }

    if (startsNewGroup) {
      groups.push(createGroup(candidate));
      continue;
    }

    currentGroup.candidates.push(candidate);
    currentGroup.lastRow = candidate.rowNumber;
  }

  return groups.map((group, index) => {
    const text = group.candidates
      .map((candidate) => candidate.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const isPossibleAddon = group.candidates.some(
      (candidate) => candidate.isPossibleAddon,
    );

    const quantityHint = isPossibleAddon
      ? null
      : (group.candidates
          .map((candidate) => getQuantityHint(candidate.text))
          .find((quantity): quantity is number => quantity !== null) ?? null);

    return {
      sequence: index + 1,
      rows: group.candidates.map((candidate) => candidate.rowNumber),
      text,
      confidence: averageConfidence(group.candidates),
      quantityHint,
      isPossibleAddon,
      structuredPriceRows: group.candidates
        .map((candidate) => candidate.rowNumber)
        .filter((rowNumber) => structuredPriceRows.has(rowNumber)),
    };
  });
}
