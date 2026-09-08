import { buildReceiptRows } from "@/lib/receipts/build-receipt-rows";
import type { ReceiptOcrResult } from "@/lib/receipts/run-receipt-ocr";

export type ParsedReceiptField<T> = {
  value: T;
  confidence: number;
  sourceText: string;
  needsReview: boolean;
};

export type ParsedReceiptDate = {
  date: string;
  time: string | null;
};

export type ParsedReceiptSummary = {
  merchant: ParsedReceiptField<string> | null;
  receiptDate: ParsedReceiptField<ParsedReceiptDate> | null;
  subtotal: ParsedReceiptField<number> | null;
  serviceCharge: ParsedReceiptField<number> | null;
  tax: ParsedReceiptField<number> | null;
  rounding: ParsedReceiptField<number> | null;
  total: ParsedReceiptField<number> | null;
  warnings: string[];
};

type SummarySource = {
  text: string;
  confidence: number;
  rowIndex: number;
};

type TotalCandidate = {
  value: number;
  confidence: number;
  priority: number;
  sourceText: string;
};

const MONEY_PATTERN = /-?\s*(?:RM\s*)?\d{1,6}\s*[.,]\s*\d{1,2}/gi;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractLastMoney(text: string) {
  const matches = Array.from(text.matchAll(MONEY_PATTERN));
  const lastMatch = matches.at(-1);

  if (!lastMatch) {
    return null;
  }

  const normalizedAmount = lastMatch[0]
    .replace(/RM/gi, "")
    .replace(/\s+/g, "")
    .replace(",", ".");

  const value = Number(normalizedAmount);

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function createNumberField(
  source: SummarySource,
): ParsedReceiptField<number> | null {
  const value = extractLastMoney(source.text);

  if (value === null) {
    return null;
  }

  return {
    value,
    confidence: source.confidence,
    sourceText: source.text,
    needsReview: source.confidence < 70,
  };
}

function findBestNumberField(
  sources: SummarySource[],
  matcher: (normalizedText: string) => boolean,
): ParsedReceiptField<number> | null {
  const matches = sources
    .filter((source) => matcher(normalizeText(source.text)))
    .map(createNumberField)
    .filter((field): field is ParsedReceiptField<number> => field !== null)
    .sort((first, second) => second.confidence - first.confidence);

  return matches[0] ?? null;
}

function findSubtotal(sources: SummarySource[]) {
  return findBestNumberField(sources, (text) => {
    return (
      (text.includes("subtotal") ||
        text.includes("total sales") ||
        /\bsales\b/.test(text) ||
        text.startsWith("product")) &&
      !text.includes("before rounding")
    );
  });
}

function findServiceCharge(sources: SummarySource[]) {
  return findBestNumberField(sources, (text) => {
    return (
      text.includes("service") &&
      (text.includes("charge") || text.includes("crg"))
    );
  });
}

function findTax(sources: SummarySource[]) {
  return findBestNumberField(sources, (text) => {
    if (text.includes("tax & charges summary")) {
      return false;
    }

    return (
      text.includes("sst") ||
      text.includes("service tax") ||
      /\btax\b/.test(text)
    );
  });
}

function findRounding(sources: SummarySource[]) {
  return findBestNumberField(sources, (text) => {
    return text.includes("rounding") && !text.includes("before rounding");
  });
}

function getTotalPriority(normalizedText: string) {
  if (normalizedText.includes("net total")) {
    return 110;
  }

  if (normalizedText.includes("total amount")) {
    return 105;
  }

  if (
    normalizedText.includes("total (rm") ||
    normalizedText.includes("total (myr")
  ) {
    return 100;
  }

  if (
    normalizedText.includes("credit/debit") ||
    normalizedText.includes("qr pay")
  ) {
    return 95;
  }

  if (
    normalizedText.includes("total sales") ||
    normalizedText.includes("amount paid")
  ) {
    return 90;
  }

  if (normalizedText.includes("before rounding")) {
    return 75;
  }

  if (
    normalizedText.startsWith("product") ||
    normalizedText.includes(" product ")
  ) {
    return 70;
  }

  if (/\btotal\b/.test(normalizedText)) {
    return 85;
  }

  return 0;
}

function collectTotalCandidates(sources: SummarySource[]): TotalCandidate[] {
  const candidates: TotalCandidate[] = [];

  for (const source of sources) {
    const normalizedText = normalizeText(source.text);

    if (
      normalizedText.includes("subtotal") ||
      normalizedText.includes("tax & charges summary")
    ) {
      continue;
    }

    const priority = getTotalPriority(normalizedText);

    if (priority === 0) {
      continue;
    }

    const value = extractLastMoney(source.text);

    if (value === null) {
      continue;
    }

    candidates.push({
      value,
      confidence: source.confidence,
      priority,
      sourceText: source.text,
    });
  }

  return candidates;
}

function addDerivedTotalCandidate(
  candidates: TotalCandidate[],
  subtotal: ParsedReceiptField<number> | null,
  serviceCharge: ParsedReceiptField<number> | null,
  tax: ParsedReceiptField<number> | null,
  rounding: ParsedReceiptField<number> | null,
) {
  if (!subtotal) {
    return;
  }

  const hasAdjustment =
    serviceCharge !== null || tax !== null || rounding !== null;

  const derivedTotal =
    subtotal.value +
    (serviceCharge?.value ?? 0) +
    (tax?.value ?? 0) +
    (rounding?.value ?? 0);

  candidates.push({
    value: Math.round(derivedTotal * 100) / 100,
    confidence: Math.min(
      subtotal.confidence,
      serviceCharge?.confidence ?? 100,
      tax?.confidence ?? 100,
      rounding?.confidence ?? 100,
    ),
    priority: hasAdjustment ? 120 : 72,
    sourceText: "Calculated from subtotal and adjustments",
  });
}

function chooseTotal(
  candidates: TotalCandidate[],
): ParsedReceiptField<number> | null {
  if (candidates.length === 0) {
    return null;
  }

  const hasPositiveCandidate = candidates.some(
    (candidate) => candidate.value > 0,
  );

  const usableCandidates = candidates.filter((candidate) => {
    if (hasPositiveCandidate && candidate.value === 0) {
      return false;
    }

    return true;
  });

  const groups = new Map<number, TotalCandidate[]>();

  for (const candidate of usableCandidates) {
    const amountInCents = Math.round(candidate.value * 100);
    const existingGroup = groups.get(amountInCents);

    if (existingGroup) {
      existingGroup.push(candidate);
    } else {
      groups.set(amountInCents, [candidate]);
    }
  }

  const rankedGroups = Array.from(groups.values())
    .map((group) => {
      const score = group.reduce((sum, candidate) => {
        return sum + candidate.priority + candidate.confidence / 10;
      }, 0);

      return {
        group,
        score,
      };
    })
    .sort((first, second) => second.score - first.score);

  const winningGroup = rankedGroups[0]?.group;

  if (!winningGroup) {
    return null;
  }

  const averageConfidence = Math.round(
    winningGroup.reduce((sum, candidate) => sum + candidate.confidence, 0) /
      winningGroup.length,
  );

  const confidence = Math.min(
    99,
    averageConfidence + Math.max(0, winningGroup.length - 1) * 5,
  );

  return {
    value: winningGroup[0].value,
    confidence,
    sourceText: winningGroup
      .slice(0, 3)
      .map((candidate) => candidate.sourceText)
      .join(" | "),
    needsReview: confidence < 70 || winningGroup.length < 2,
  };
}

function parseDateSource(
  source: SummarySource,
): ParsedReceiptField<ParsedReceiptDate> | null {
  const yearFirstMatch = source.text.match(
    /\b(\d{4})[/-](\d{2})[/-](\d{2})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i,
  );

  const dayFirstMatch = source.text.match(
    /\b(\d{2})[/-](\d{2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i,
  );

  const match = yearFirstMatch ?? dayFirstMatch;

  if (!match) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;

  if (yearFirstMatch) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    day = Number(match[1]);
    month = Number(match[2]);

    const parsedYear = Number(match[3]);
    year = match[3].length === 2 ? 2000 + parsedYear : parsedYear;
  }

  const validDate =
    year >= 2000 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(year, month, 0).getDate();

  if (!validDate) {
    return null;
  }

  const hourText = match[4];
  const minuteText = match[5];
  const meridiem = match[6]?.toLowerCase();

  let normalizedTime: string | null = null;
  let invalidTime = false;

  if (hourText && minuteText) {
    let hour = Number(hourText);
    const minute = Number(minuteText);

    if (minute < 0 || minute > 59 || hour < 0 || hour > (meridiem ? 12 : 23)) {
      invalidTime = true;
    } else {
      if (meridiem === "pm" && hour < 12) {
        hour += 12;
      }

      if (meridiem === "am" && hour === 12) {
        hour = 0;
      }

      normalizedTime = `${String(hour).padStart(
        2,
        "0",
      )}:${String(minute).padStart(2, "0")}`;
    }
  }

  return {
    value: {
      date: `${year}-${String(month).padStart(
        2,
        "0",
      )}-${String(day).padStart(2, "0")}`,
      time: normalizedTime,
    },
    confidence: invalidTime
      ? Math.min(source.confidence, 50)
      : source.confidence,
    sourceText: source.text,
    needsReview: invalidTime || source.confidence < 70 || match[3].length === 2,
  };
}

function findReceiptDate(sources: SummarySource[]) {
  for (const source of sources) {
    const parsedDate = parseDateSource(source);

    if (parsedDate) {
      return parsedDate;
    }
  }

  return null;
}

function findMerchant(sources: SummarySource[]) {
  const headerEndingTerms = [
    "receipt",
    "invoice",
    "date",
    "cashier",
    "counter",
    "operator",
    "table",
    "eat-in",
    "dine-in",
    "qty item",
    "name num",
  ];

  const excludedTerms = [
    "receipt",
    "invoice",
    "date",
    "cashier",
    "counter",
    "operator",
    "table",
    "order",
    "subtotal",
    "total",
    "service",
    "tax",
    "sst",
    "tel:",
    "phone",
    "jalan",
    "persiaran",
    "selangor",
    "kuala lumpur",
    "password",
    "wifi",
    "wift",
    "guest",
    "reg no",
    "co no",
    "subsidiary",
  ];

  const headerEndIndex = sources.findIndex((source) => {
    const text = normalizeText(source.text);

    return headerEndingTerms.some((term) => text.includes(term));
  });

  const headerSources =
    headerEndIndex >= 0
      ? sources.slice(0, headerEndIndex)
      : sources.slice(0, 8);

  const candidates = headerSources
    .filter((source) => {
      const normalizedText = normalizeText(source.text);
      const letters = source.text.match(/[a-z]/gi) ?? [];
      const uppercaseLetters = source.text.match(/[A-Z]/g) ?? [];

      const uppercaseRatio =
        letters.length > 0 ? uppercaseLetters.length / letters.length : 0;

      const digitCount = source.text.match(/\d/g)?.length ?? 0;

      return (
        source.confidence >= 55 &&
        letters.length >= 5 &&
        uppercaseRatio >= 0.55 &&
        digitCount <= 2 &&
        !excludedTerms.some((term) => normalizedText.includes(term)) &&
        extractLastMoney(source.text) === null
      );
    })
    .map((source) => {
      const cleanedText = source.text
        .replace(/^[^a-z0-9(]+/i, "")
        .replace(/[^a-z0-9).&' -]+$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        source,
        cleanedText,
      };
    })
    .filter((candidate) => candidate.cleanedText.length >= 4)
    .sort(
      (first, second) => second.source.confidence - first.source.confidence,
    );

  const winner = candidates[0];

  if (!winner) {
    return null;
  }

  return {
    value: winner.cleanedText,
    confidence: winner.source.confidence,
    sourceText: winner.source.text,
    needsReview: winner.source.confidence < 75,
  } satisfies ParsedReceiptField<string>;
}

function chooseMerchant(
  layoutMerchant: ParsedReceiptField<string> | null,
  structuredMerchant: ParsedReceiptField<string> | null,
): ParsedReceiptField<string> | null {
  if (!layoutMerchant) {
    return structuredMerchant;
  }

  if (!structuredMerchant) {
    return layoutMerchant;
  }

  const layoutText = layoutMerchant.value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const structuredText = structuredMerchant.value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  /*
   * One pass may recognise a more complete merchant name while the
   * other provides a reliable common ending.
   *
   * Example:
   * Layout:     GROCER (KL) SDN BHD
   * Structured: NSK GROCER (KL) SDN BHD wv
   *
   * The shared text lets us preserve "NSK" while dropping trailing
   * OCR noise such as "wv".
   */
  if (structuredText.includes(layoutText)) {
    const sharedStart = structuredText.indexOf(layoutText);

    const sharedEnd = sharedStart + layoutMerchant.value.length;

    const reconciledValue = structuredMerchant.value.slice(0, sharedEnd).trim();

    const confidence = Math.round(
      (layoutMerchant.confidence + structuredMerchant.confidence) / 2,
    );

    return {
      value: reconciledValue,
      confidence,
      sourceText: `${layoutMerchant.sourceText} | ${structuredMerchant.sourceText}`,
      needsReview: confidence < 75,
    };
  }

  if (layoutText.includes(structuredText)) {
    const sharedStart = layoutText.indexOf(structuredText);
    const sharedEnd = sharedStart + structuredMerchant.value.length;

    const reconciledValue = layoutMerchant.value.slice(0, sharedEnd).trim();

    const confidence = Math.round(
      (layoutMerchant.confidence + structuredMerchant.confidence) / 2,
    );

    return {
      value: reconciledValue,
      confidence,
      sourceText: `${layoutMerchant.sourceText} | ${structuredMerchant.sourceText}`,
      needsReview: confidence < 75,
    };
  }

  return layoutMerchant.confidence >= structuredMerchant.confidence
    ? layoutMerchant
    : structuredMerchant;
}

export function parseReceiptSummary(
  ocrResult: ReceiptOcrResult,
): ParsedReceiptSummary {
  const layoutRows = buildReceiptRows(ocrResult.layout.words);

  const structuredRows = buildReceiptRows(ocrResult.structured.words);

  const layoutSources: SummarySource[] = layoutRows.map((row, rowIndex) => ({
    text: row.text,
    confidence: row.confidence,
    rowIndex,
  }));

  const structuredSources: SummarySource[] = structuredRows.map(
    (row, rowIndex) => ({
      text: row.text,
      confidence: row.confidence,
      rowIndex: layoutSources.length + rowIndex,
    }),
  );

  const sources = [...layoutSources, ...structuredSources];

  const layoutMerchant = findMerchant(layoutSources);
  const structuredMerchant = findMerchant(structuredSources);

  const merchant = chooseMerchant(layoutMerchant, structuredMerchant);
  const receiptDate = findReceiptDate(sources);
  const subtotal = findSubtotal(sources);
  const serviceCharge = findServiceCharge(sources);
  const tax = findTax(sources);
  const rounding = findRounding(sources);

  const totalCandidates = collectTotalCandidates(sources);

  addDerivedTotalCandidate(
    totalCandidates,
    subtotal,
    serviceCharge,
    tax,
    rounding,
  );

  const total = chooseTotal(totalCandidates);
  const warnings: string[] = [];

  if (!merchant) {
    warnings.push("Merchant could not be detected.");
  }

  if (!receiptDate) {
    warnings.push("Receipt date could not be detected.");
  } else if (receiptDate.needsReview) {
    warnings.push("Receipt date or time needs review.");
  }

  if (!subtotal) {
    warnings.push("Subtotal could not be detected.");
  }

  if (!total) {
    warnings.push("Expense total could not be detected.");
  } else if (total.needsReview) {
    warnings.push("Expense total has limited supporting evidence.");
  }

  if (subtotal && total) {
    const calculatedTotal =
      subtotal.value +
      (serviceCharge?.value ?? 0) +
      (tax?.value ?? 0) +
      (rounding?.value ?? 0);

    if (Math.abs(calculatedTotal - total.value) > 0.02) {
      warnings.push(
        "Subtotal and adjustments do not match the selected total.",
      );
    }
  }

  return {
    merchant,
    receiptDate,
    subtotal,
    serviceCharge,
    tax,
    rounding,
    total,
    warnings,
  };
}
