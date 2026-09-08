import {
  buildReceiptRows,
  type ReceiptVisualRow,
} from "@/lib/receipts/build-receipt-rows";
import type {
  ReceiptOcrResult,
  ReceiptOcrWord,
} from "@/lib/receipts/run-receipt-ocr";

export type ReceiptNameCandidate = {
  rowNumber: number;
  text: string;
  confidence: number;
  leftRatio: number;
  isPossibleAddon: boolean;
};

export type ReceiptPriceCandidate = {
  rowNumber: number;
  amount: number;
  confidence: number;
  horizontalRatio: number;
  sourceText: string;
};

export type ReceiptPerUnitCandidate = {
  startRow: number;
  endRow: number;
  amount: number;
  confidence: number;
  sourceText: string;
};

export type ReceiptItemCandidateAnalysis = {
  itemSectionStart: number | null;
  itemSectionEnd: number | null;
  nameCandidates: ReceiptNameCandidate[];
  priceCandidates: ReceiptPriceCandidate[];
  perUnitCandidates: ReceiptPerUnitCandidate[];
  warnings: string[];
};

export type ReceiptItemCandidatePass = "layout" | "structured" | "recovery";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseMoneyToken(token: string) {
  const cleanedToken = token
    .replace(/RM/gi, "")
    .replace(/[()[\]{}@]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[;:]+$/g, "");

  if (!/^-?\d{1,6}(?:\.\d{1,2})?$/.test(cleanedToken)) {
    return null;
  }

  /*
   * Item prices should normally contain a decimal separator.
   * A bare integer is accepted only when it originated from a token
   * containing "." or "," before cleaning.
   */
  const originallyContainedDecimal = /[.,]/.test(token);

  if (!originallyContainedDecimal) {
    return null;
  }

  const value = Number(cleanedToken);

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function looksLikePrintedUnitRate(token: string) {
  const normalizedToken = token.toLowerCase().replace(/\s+/g, "");

  return (
    normalizedToken.includes("@") ||
    normalizedToken.includes("©") ||
    /\/e[a0o]\b/.test(normalizedToken)
  );
}

function isItemHeader(text: string) {
  const normalizedText = normalizeText(text);

  return (
    (normalizedText.includes("qty") && normalizedText.includes("item")) ||
    (normalizedText.includes("item") && normalizedText.includes("price")) ||
    (normalizedText.includes("name") && normalizedText.includes("num")) ||
    normalizedText.includes("price (myr)")
  );
}

function isSummaryStart(text: string) {
  const normalizedText = normalizeText(text);

  return (
    normalizedText.includes("subtotal") ||
    /^\W*product\b/.test(normalizedText) ||
    normalizedText.includes("total sales") ||
    (normalizedText.includes("sales") && normalizedText.includes("rm")) ||
    normalizedText.includes("net total") ||
    normalizedText.includes("total amount") ||
    /^\W*total\b/.test(normalizedText) ||
    normalizedText.includes("service charge") ||
    normalizedText.includes("servicecrg") ||
    normalizedText.includes("rounding adjustment") ||
    normalizedText.includes("payment method") ||
    normalizedText.includes("credit/debit") ||
    (normalizedText.includes("quantity") && normalizedText.includes("unit")) ||
    /^\W*\d+\s+qty\b/.test(normalizedText) ||
    /\b\d{1,3}\s+units?\s*$/.test(normalizedText)
  );
}

function hasLetters(text: string) {
  return (text.match(/[a-z]/gi)?.length ?? 0) >= 3;
}

function hasMoneyToken(row: ReceiptVisualRow) {
  return row.words.some((word) => parseMoneyToken(word.text) !== null);
}

function findItemSectionStart(rows: ReceiptVisualRow[]) {
  const headerIndex = rows.findIndex((row) => isItemHeader(row.text));

  if (headerIndex >= 0) {
    return headerIndex + 1;
  }

  /*
   * Some receipts do not print a useful Qty/Item header.
   * Fall back to the first row containing both readable letters
   * and a decimal monetary value.
   */
  return rows.findIndex((row) => {
    return (
      row.confidence >= 35 &&
      hasLetters(row.text) &&
      hasMoneyToken(row) &&
      !isSummaryStart(row.text)
    );
  });
}

function findItemSectionEnd(rows: ReceiptVisualRow[], startIndex: number) {
  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex += 1) {
    if (isSummaryStart(rows[rowIndex].text)) {
      return rowIndex;
    }
  }

  return rows.length;
}

function getWordCenterX(word: ReceiptOcrWord) {
  return (word.boundingBox.x0 + word.boundingBox.x1) / 2;
}

function getSectionHorizontalBounds(rows: ReceiptVisualRow[]) {
  const words = rows.flatMap((row) => row.words);

  if (words.length === 0) {
    return null;
  }

  const left = Math.min(...words.map((word) => word.boundingBox.x0));

  const right = Math.max(...words.map((word) => word.boundingBox.x1));

  return {
    left,
    right,
    width: Math.max(1, right - left),
  };
}

function buildPriceCandidates(
  rows: ReceiptVisualRow[],
  startIndex: number,
  sectionLeft: number,
  sectionWidth: number,
) {
  type MonetaryWord = {
    rowNumber: number;
    amount: number;
    confidence: number;
    centerX: number;
    sourceText: string;
  };

  const monetaryWords: MonetaryWord[] = [];

  rows.forEach((row, localRowIndex) => {
    const rowNumber = startIndex + localRowIndex + 1;

    for (const word of row.words) {
      if (looksLikePrintedUnitRate(word.text)) {
        continue;
      }

      const amount = parseMoneyToken(word.text);

      if (amount === null) {
        continue;
      }

      monetaryWords.push({
        rowNumber,
        amount,
        confidence: word.confidence,
        centerX: getWordCenterX(word),
        sourceText: row.text,
      });
    }
  });

  if (monetaryWords.length === 0) {
    return [];
  }

  /*
   * Anchor the column to monetary values rather than the furthest
   * OCR word. Random punctuation and background text can otherwise
   * make the calculated receipt width unreliable.
   */
  const rightmostMoneyCenter = Math.max(
    ...monetaryWords.map((word) => word.centerX),
  );

  /*
   * Allow some leftward drift for long, tilted or curved receipts,
   * while preventing the tolerance from becoming excessively wide.
   */
  const priceColumnTolerance = Math.max(32, Math.min(120, sectionWidth * 0.12));

  const priceColumnStart = rightmostMoneyCenter - priceColumnTolerance;

  const candidatesByRow = new Map<number, ReceiptPriceCandidate>();

  for (const monetaryWord of monetaryWords) {
    if (monetaryWord.centerX < priceColumnStart) {
      continue;
    }

    const horizontalRatio = (monetaryWord.centerX - sectionLeft) / sectionWidth;

    const candidate: ReceiptPriceCandidate = {
      rowNumber: monetaryWord.rowNumber,
      amount: monetaryWord.amount,
      confidence: monetaryWord.confidence,
      horizontalRatio,
      sourceText: monetaryWord.sourceText,
    };

    const existingCandidate = candidatesByRow.get(monetaryWord.rowNumber);

    /*
     * When a row contains multiple amounts, retain the
     * rightmost one.
     */
    if (
      !existingCandidate ||
      candidate.horizontalRatio > existingCandidate.horizontalRatio
    ) {
      candidatesByRow.set(monetaryWord.rowNumber, candidate);
    }
  }

  return Array.from(candidatesByRow.values()).sort(
    (first, second) => first.rowNumber - second.rowNumber,
  );
}

function buildNameCandidates(
  rows: ReceiptVisualRow[],
  startIndex: number,
  sectionLeft: number,
  sectionWidth: number,
) {
  const priceColumnStart = sectionLeft + sectionWidth * 0.68;

  const candidates: ReceiptNameCandidate[] = [];

  rows.forEach((row, localRowIndex) => {
    const fullRowIndex = startIndex + localRowIndex;
    const rowNumber = fullRowIndex + 1;

    const descriptionWords = row.words
      .filter((word) => getWordCenterX(word) < priceColumnStart)
      .filter((word) => parseMoneyToken(word.text) === null)
      .sort((first, second) => first.boundingBox.x0 - second.boundingBox.x0);

    const text = descriptionWords
      .map((word) => word.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!hasLetters(text)) {
      return;
    }

    if (isItemHeader(text) || isSummaryStart(text)) {
      return;
    }

    const left = Math.min(
      ...descriptionWords.map((word) => word.boundingBox.x0),
    );

    const leftRatio = (left - sectionLeft) / sectionWidth;

    const normalizedText = normalizeText(text);

    const isPossibleAddon =
      /^[+•»›-]\s*/.test(text) ||
      normalizedText.includes(" add ") ||
      normalizedText.startsWith("add ") ||
      normalizedText.startsWith("free add");

    candidates.push({
      rowNumber,
      text,
      confidence: row.confidence,
      leftRatio,
      isPossibleAddon,
    });
  });

  return candidates;
}

function parsePerUnitAmounts(text: string) {
  const amounts: number[] = [];

  const matches = text.matchAll(/(\d{1,6}(?:[.,]\d{1,2}))\s*\/\s*e[a0o]\b/gi);

  for (const match of matches) {
    const value = Number(match[1].replace(",", "."));

    if (Number.isFinite(value)) {
      amounts.push(Math.round(value * 100) / 100);
    }
  }

  return amounts;
}

function buildPerUnitCandidates(nameCandidates: ReceiptNameCandidate[]) {
  const candidatesByKey = new Map<string, ReceiptPerUnitCandidate>();

  const sortedCandidates = [...nameCandidates].sort(
    (first, second) => first.rowNumber - second.rowNumber,
  );

  function addCandidate(
    startRow: number,
    endRow: number,
    amount: number,
    confidence: number,
    sourceText: string,
  ) {
    const key = `${startRow}:${amount.toFixed(2)}`;

    const existing = candidatesByKey.get(key);

    if (existing && existing.confidence >= confidence) {
      return;
    }

    candidatesByKey.set(key, {
      startRow,
      endRow,
      amount,
      confidence,
      sourceText,
    });
  }

  sortedCandidates.forEach((candidate, index) => {
    const directAmounts = parsePerUnitAmounts(candidate.text);

    for (const amount of directAmounts) {
      addCandidate(
        candidate.rowNumber,
        candidate.rowNumber,
        amount,
        candidate.confidence,
        candidate.text,
      );
    }

    /*
     * The value was complete on this row, so do not combine
     * it with the following item row.
     */
    if (directAmounts.length > 0) {
      return;
    }

    const nextCandidate = sortedCandidates[index + 1];

    if (
      !nextCandidate ||
      nextCandidate.rowNumber !== candidate.rowNumber + 1 ||
      !candidate.text.includes("/")
    ) {
      return;
    }

    /*
     * Handles OCR splitting "(6.00/" and "ea)"
     * across adjacent visual rows.
     */
    const combinedText = `${candidate.text} ${nextCandidate.text}`;

    const combinedAmounts = parsePerUnitAmounts(combinedText);

    const combinedConfidence = Math.round(
      (candidate.confidence + nextCandidate.confidence) / 2,
    );

    for (const amount of combinedAmounts) {
      addCandidate(
        candidate.rowNumber,
        nextCandidate.rowNumber,
        amount,
        combinedConfidence,
        combinedText,
      );
    }
  });

  return Array.from(candidatesByKey.values()).sort(
    (first, second) => first.startRow - second.startRow,
  );
}

export function extractReceiptItemCandidates(
  ocrResult: ReceiptOcrResult,
  pass: ReceiptItemCandidatePass = "structured",
): ReceiptItemCandidateAnalysis {
  const rows = buildReceiptRows(ocrResult[pass].words);

  const warnings: string[] = [];
  const startIndex = findItemSectionStart(rows);

  if (startIndex < 0) {
    return {
      itemSectionStart: null,
      itemSectionEnd: null,
      nameCandidates: [],
      priceCandidates: [],
      perUnitCandidates: [],
      warnings: ["The beginning of the item section could not be detected."],
    };
  }

  const endIndex = findItemSectionEnd(rows, startIndex);

  const itemRows = rows.slice(startIndex, endIndex);
  const bounds = getSectionHorizontalBounds(itemRows);

  if (!bounds) {
    return {
      itemSectionStart: startIndex + 1,
      itemSectionEnd: endIndex,
      nameCandidates: [],
      priceCandidates: [],
      perUnitCandidates: [],
      warnings: ["No positioned words were found in the item section."],
    };
  }

  const nameCandidates = buildNameCandidates(
    itemRows,
    startIndex,
    bounds.left,
    bounds.width,
  );

  const perUnitCandidates = buildPerUnitCandidates(nameCandidates);

  const priceCandidates = buildPriceCandidates(
    itemRows,
    startIndex,
    bounds.left,
    bounds.width,
  );

  if (nameCandidates.length === 0) {
    warnings.push("No item-name candidates were detected.");
  }

  if (priceCandidates.length === 0) {
    warnings.push("No right-column prices were detected.");
  }

  return {
    itemSectionStart: startIndex + 1,
    itemSectionEnd: endIndex,
    nameCandidates,
    priceCandidates,
    perUnitCandidates,
    warnings,
  };
}
