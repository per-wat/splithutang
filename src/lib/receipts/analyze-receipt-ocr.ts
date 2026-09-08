import { extractReceiptItemCandidates } from "@/lib/receipts/extract-receipt-item-candidates";
import { fuseReceiptPriceCandidates } from "@/lib/receipts/fuse-receipt-price-candidates";
import { groupReceiptNameCandidates } from "@/lib/receipts/group-receipt-name-candidates";
import { matchReceiptItems } from "@/lib/receipts/match-receipt-items";
import { parseReceiptSummary } from "@/lib/receipts/parse-receipt-summary";
import type { ReceiptOcrResult } from "@/lib/receipts/run-receipt-ocr";

export function analyzeReceiptOcr(ocrResult: ReceiptOcrResult) {
  const summary = parseReceiptSummary(ocrResult);
  const structuredCandidates = extractReceiptItemCandidates(
    ocrResult,
    "structured",
  );
  const layoutCandidates = extractReceiptItemCandidates(ocrResult, "layout");
  const recoveryCandidates = extractReceiptItemCandidates(
    ocrResult,
    "recovery",
  );
  const fusedPrices = fuseReceiptPriceCandidates({
    structured: structuredCandidates,
    layout: layoutCandidates,
    recovery: recoveryCandidates,
  });
  const groupedNames = groupReceiptNameCandidates(
    structuredCandidates,
    fusedPrices.length,
  );
  const matchedItems = matchReceiptItems(
    groupedNames,
    fusedPrices,
    structuredCandidates,
    summary,
  );

  return {
    summary,
    matchedItems,
  };
}

export type ReceiptAnalysis = ReturnType<typeof analyzeReceiptOcr>;
