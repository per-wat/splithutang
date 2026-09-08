import type {
  ReceiptItemCandidateAnalysis,
  ReceiptItemCandidatePass,
} from "@/lib/receipts/extract-receipt-item-candidates";

export type ReceiptPriceEvidence = {
  pass: ReceiptItemCandidatePass;
  rowNumber: number;
  confidence: number;
};

export type FusedReceiptPriceCandidate = {
  sequence: number;
  amount: number;
  confidence: number;
  evidence: ReceiptPriceEvidence[];
};

type InternalPriceCandidate = Omit<FusedReceiptPriceCandidate, "sequence">;

function amountsMatch(firstAmount: number, secondAmount: number) {
  return Math.round(firstAmount * 100) === Math.round(secondAmount * 100);
}

function combineEvidence(
  first: InternalPriceCandidate,
  second: InternalPriceCandidate,
): InternalPriceCandidate {
  const evidenceByKey = new Map<string, ReceiptPriceEvidence>();

  for (const evidence of [...first.evidence, ...second.evidence]) {
    const key = `${evidence.pass}:${evidence.rowNumber}`;

    const existing = evidenceByKey.get(key);

    if (!existing || evidence.confidence > existing.confidence) {
      evidenceByKey.set(key, evidence);
    }
  }

  return {
    amount: first.amount,
    confidence: Math.max(first.confidence, second.confidence),
    evidence: Array.from(evidenceByKey.values()),
  };
}

function mergePriceSequences(
  primary: InternalPriceCandidate[],
  secondary: InternalPriceCandidate[],
) {
  const primaryLength = primary.length;
  const secondaryLength = secondary.length;

  const longestCommonSequence = Array.from({ length: primaryLength + 1 }, () =>
    Array<number>(secondaryLength + 1).fill(0),
  );

  for (
    let primaryIndex = primaryLength - 1;
    primaryIndex >= 0;
    primaryIndex -= 1
  ) {
    for (
      let secondaryIndex = secondaryLength - 1;
      secondaryIndex >= 0;
      secondaryIndex -= 1
    ) {
      if (
        amountsMatch(
          primary[primaryIndex].amount,
          secondary[secondaryIndex].amount,
        )
      ) {
        longestCommonSequence[primaryIndex][secondaryIndex] =
          1 + longestCommonSequence[primaryIndex + 1][secondaryIndex + 1];
      } else {
        longestCommonSequence[primaryIndex][secondaryIndex] = Math.max(
          longestCommonSequence[primaryIndex + 1][secondaryIndex],
          longestCommonSequence[primaryIndex][secondaryIndex + 1],
        );
      }
    }
  }

  const merged: InternalPriceCandidate[] = [];

  let primaryIndex = 0;
  let secondaryIndex = 0;

  while (primaryIndex < primaryLength && secondaryIndex < secondaryLength) {
    const primaryCandidate = primary[primaryIndex];
    const secondaryCandidate = secondary[secondaryIndex];

    if (amountsMatch(primaryCandidate.amount, secondaryCandidate.amount)) {
      merged.push(combineEvidence(primaryCandidate, secondaryCandidate));

      primaryIndex += 1;
      secondaryIndex += 1;
      continue;
    }

    const skipPrimaryScore =
      longestCommonSequence[primaryIndex + 1][secondaryIndex];

    const skipSecondaryScore =
      longestCommonSequence[primaryIndex][secondaryIndex + 1];

    if (skipPrimaryScore >= skipSecondaryScore) {
      merged.push(primaryCandidate);
      primaryIndex += 1;
    } else {
      merged.push(secondaryCandidate);
      secondaryIndex += 1;
    }
  }

  while (primaryIndex < primaryLength) {
    merged.push(primary[primaryIndex]);
    primaryIndex += 1;
  }

  while (secondaryIndex < secondaryLength) {
    merged.push(secondary[secondaryIndex]);
    secondaryIndex += 1;
  }

  return merged;
}

export function fuseReceiptPriceCandidates(
  analyses: Record<ReceiptItemCandidatePass, ReceiptItemCandidateAnalysis>,
): FusedReceiptPriceCandidate[] {
  const passPriority: Record<ReceiptItemCandidatePass, number> = {
    structured: 0,
    recovery: 1,
    layout: 2,
  };

  const sequences = (["structured", "layout", "recovery"] as const)
    .map((pass) => {
      const prices = analyses[pass].priceCandidates
        .slice()
        .sort((first, second) => first.rowNumber - second.rowNumber)
        .map<InternalPriceCandidate>((candidate) => ({
          amount: candidate.amount,
          confidence: candidate.confidence,
          evidence: [
            {
              pass,
              rowNumber: candidate.rowNumber,
              confidence: candidate.confidence,
            },
          ],
        }));

      return {
        pass,
        prices,
      };
    })
    .sort((first, second) => {
      const lengthDifference = second.prices.length - first.prices.length;

      if (lengthDifference !== 0) {
        return lengthDifference;
      }

      return passPriority[first.pass] - passPriority[second.pass];
    });

  let fused = sequences[0]?.prices ?? [];

  for (
    let sequenceIndex = 1;
    sequenceIndex < sequences.length;
    sequenceIndex += 1
  ) {
    fused = mergePriceSequences(fused, sequences[sequenceIndex].prices);
  }

  return fused.map((candidate, index) => ({
    sequence: index + 1,
    ...candidate,
  }));
}
