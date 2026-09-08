"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

import { preprocessReceiptImage } from "@/lib/receipts/preprocess-receipt";
import {
  runReceiptOcr,
  type ReceiptOcrResult,
} from "@/lib/receipts/run-receipt-ocr";
import { buildReceiptRows } from "@/lib/receipts/build-receipt-rows";
import { parseReceiptSummary } from "@/lib/receipts/parse-receipt-summary";
import {
  extractReceiptItemCandidates,
  type ReceiptItemCandidateAnalysis,
} from "@/lib/receipts/extract-receipt-item-candidates";
import { fuseReceiptPriceCandidates } from "@/lib/receipts/fuse-receipt-price-candidates";
import { groupReceiptNameCandidates } from "@/lib/receipts/group-receipt-name-candidates";
import { matchReceiptItems } from "@/lib/receipts/match-receipt-items";
import { ReceiptReviewEditor } from "@/components/receipts/receipt-review-editor";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ReceiptTestClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalUrlRef = useRef<string | null>(null);
  const processedUrlRef = useRef<string | null>(null);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Waiting for a receipt");
  const [progress, setProgress] = useState(0);
  const [ocrResult, setOcrResult] = useState<ReceiptOcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const structuredRows = useMemo(() => {
    if (!ocrResult) {
      return [];
    }

    return buildReceiptRows(ocrResult.structured.words);
  }, [ocrResult]);

  const receiptSummary = useMemo(() => {
    if (!ocrResult) {
      return null;
    }

    return parseReceiptSummary(ocrResult);
  }, [ocrResult]);

  const itemCandidateAnalysis = useMemo(() => {
    if (!ocrResult) {
      return null;
    }

    return extractReceiptItemCandidates(ocrResult);
  }, [ocrResult]);

  const layoutItemCandidateAnalysis = useMemo(() => {
    if (!ocrResult) {
      return null;
    }

    return extractReceiptItemCandidates(ocrResult, "layout");
  }, [ocrResult]);

  const recoveryItemCandidateAnalysis = useMemo(() => {
    if (!ocrResult) {
      return null;
    }

    return extractReceiptItemCandidates(ocrResult, "recovery");
  }, [ocrResult]);

  const itemCandidateDebugText = useMemo(() => {
    if (!itemCandidateAnalysis) {
      return "";
    }

    const nameLines = itemCandidateAnalysis.nameCandidates.map((candidate) => {
      const row = String(candidate.rowNumber).padStart(2, "0");

      const confidence = String(candidate.confidence).padStart(3, " ");

      const left = candidate.leftRatio.toFixed(2);
      const type = candidate.isPossibleAddon ? "ADDON" : "ITEM ";

      return `${row} [${confidence}%] [x=${left}] [${type}] ${candidate.text}`;
    });

    const priceLines = itemCandidateAnalysis.priceCandidates.map(
      (candidate) => {
        const row = String(candidate.rowNumber).padStart(2, "0");

        const confidence = String(candidate.confidence).padStart(3, " ");

        const horizontalPosition = candidate.horizontalRatio.toFixed(2);

        return `${row} [${confidence}%] [x=${horizontalPosition}] RM${candidate.amount.toFixed(
          2,
        )}`;
      },
    );

    return [
      `Item section: rows ${
        itemCandidateAnalysis.itemSectionStart ?? "?"
      }–${itemCandidateAnalysis.itemSectionEnd ?? "?"}`,
      "",
      "NAME CANDIDATES",
      ...nameLines,
      "",
      "RIGHT-COLUMN PRICE CANDIDATES",
      ...priceLines,
    ].join("\n");
  }, [itemCandidateAnalysis]);

  const reconstructedRowText = useMemo(() => {
    return structuredRows
      .map((row, index) => {
        const rowNumber = String(index + 1).padStart(2, "0");
        const confidence = String(row.confidence).padStart(3, " ");

        return `${rowNumber} [${confidence}%] ${row.text}`;
      })
      .join("\n");
  }, [structuredRows]);

  const alternatePriceDebugText = useMemo(() => {
    const formatPrices = (
      label: string,
      analysis: ReceiptItemCandidateAnalysis | null,
    ) => {
      if (!analysis) {
        return `${label}\nUnavailable`;
      }

      return [
        label,
        `Item section: ${
          analysis.itemSectionStart ?? "?"
        }–${analysis.itemSectionEnd ?? "?"}`,
        ...analysis.priceCandidates.map(
          (price) =>
            `${String(price.rowNumber).padStart(2, "0")} [${Math.round(
              price.confidence,
            )}%] RM${price.amount.toFixed(2)} | ${price.sourceText}`,
        ),
      ].join("\n");
    };

    return [
      formatPrices("LAYOUT PASS PRICES", layoutItemCandidateAnalysis),
      "",
      formatPrices("RECOVERY PASS PRICES", recoveryItemCandidateAnalysis),
    ].join("\n");
  }, [layoutItemCandidateAnalysis, recoveryItemCandidateAnalysis]);

  const fusedPriceCandidates = useMemo(() => {
    if (
      !itemCandidateAnalysis ||
      !layoutItemCandidateAnalysis ||
      !recoveryItemCandidateAnalysis
    ) {
      return [];
    }

    return fuseReceiptPriceCandidates({
      structured: itemCandidateAnalysis,
      layout: layoutItemCandidateAnalysis,
      recovery: recoveryItemCandidateAnalysis,
    });
  }, [
    itemCandidateAnalysis,
    layoutItemCandidateAnalysis,
    recoveryItemCandidateAnalysis,
  ]);

  const fusedPriceDebugText = useMemo(() => {
    const lines = fusedPriceCandidates.map((candidate) => {
      const sources = candidate.evidence
        .map((evidence) => `${evidence.pass}:${evidence.rowNumber}`)
        .join(", ");

      return `${String(candidate.sequence).padStart(
        2,
        "0",
      )} [${candidate.confidence}%] RM${candidate.amount.toFixed(
        2,
      )} | ${sources}`;
    });

    const total = fusedPriceCandidates.reduce(
      (sum, candidate) => sum + candidate.amount,
      0,
    );

    return [
      "FUSED PRICE SEQUENCE",
      ...lines,
      "",
      `Candidate count: ${fusedPriceCandidates.length}`,
      `Candidate total: RM${total.toFixed(2)}`,
    ].join("\n");
  }, [fusedPriceCandidates]);

  const perUnitDebugText = useMemo(() => {
    if (!itemCandidateAnalysis) {
      return "";
    }

    const lines = itemCandidateAnalysis.perUnitCandidates.map(
      (candidate, index) => {
        const rows =
          candidate.startRow === candidate.endRow
            ? `${candidate.startRow}`
            : `${candidate.startRow}–${candidate.endRow}`;

        return `${String(index + 1).padStart(
          2,
          "0",
        )} [${candidate.confidence}%] RM${candidate.amount.toFixed(
          2,
        )} | rows ${rows} | ${candidate.sourceText}`;
      },
    );

    return ["PER-UNIT PRICE EVIDENCE", ...lines].join("\n");
  }, [itemCandidateAnalysis]);

  const groupedNameCandidates = useMemo(() => {
    if (!itemCandidateAnalysis) {
      return [];
    }

    return groupReceiptNameCandidates(
      itemCandidateAnalysis,
      fusedPriceCandidates.length,
    );
  }, [itemCandidateAnalysis, fusedPriceCandidates.length]);

  const groupedNameDebugText = useMemo(() => {
    const lines = groupedNameCandidates.map((group) => {
      const type = group.isPossibleAddon ? "ADDON" : "ITEM ";

      const quantity =
        group.quantityHint === null ? "?" : String(group.quantityHint);

      const priceRows =
        group.structuredPriceRows.length > 0
          ? group.structuredPriceRows.join(",")
          : "none";

      return `${String(group.sequence).padStart(
        2,
        "0",
      )} [${type}] [${group.confidence}%] rows=${group.rows.join(
        ",",
      )} qty=${quantity} priceRows=${priceRows} | ${group.text}`;
    });

    return [
      "GROUPED NAME EVIDENCE",
      ...lines,
      "",
      `Group count: ${groupedNameCandidates.length}`,
    ].join("\n");
  }, [groupedNameCandidates]);

  const matchedReceiptItems = useMemo(() => {
    if (!itemCandidateAnalysis || !receiptSummary) {
      return null;
    }

    return matchReceiptItems(
      groupedNameCandidates,
      fusedPriceCandidates,
      itemCandidateAnalysis,
      receiptSummary,
    );
  }, [
    groupedNameCandidates,
    fusedPriceCandidates,
    itemCandidateAnalysis,
    receiptSummary,
  ]);

  const matchedItemsDebugText = useMemo(() => {
    if (!matchedReceiptItems) {
      return "";
    }

    const itemLines = matchedReceiptItems.items.map((item) => {
      const type = item.isPossibleAddon
        ? `ADDON→${item.parentSequence ?? "?"}`
        : "ITEM";

      const amount =
        item.amount === null ? "NO PRICE" : `RM${item.amount.toFixed(2)}`;

      return `${String(item.sequence).padStart(
        2,
        "0",
      )} [${type}] [${item.confidence}%] qty=${
        item.quantity
      } ${amount} source=${
        item.amountSource ?? "none"
      }${item.needsReview ? " [REVIEW]" : ""} | ${item.name}`;
    });

    const expected =
      matchedReceiptItems.expectedAmount === null
        ? "Unavailable"
        : `RM${matchedReceiptItems.expectedAmount.toFixed(
            2,
          )} (${matchedReceiptItems.expectedAmountSource})`;

    const difference =
      matchedReceiptItems.difference === null
        ? "Unavailable"
        : `RM${matchedReceiptItems.difference.toFixed(2)}`;

    return [
      "MATCHED RECEIPT ITEMS",
      ...itemLines,
      "",
      `Calculated item total: RM${matchedReceiptItems.calculatedItemTotal.toFixed(
        2,
      )}`,
      `Expected amount: ${expected}`,
      `Difference: ${difference}`,
      "",
      "WARNINGS",
      ...(matchedReceiptItems.warnings.length > 0
        ? matchedReceiptItems.warnings
        : ["None"]),
    ].join("\n");
  }, [matchedReceiptItems]);

  useEffect(() => {
    return () => {
      if (originalUrlRef.current) {
        URL.revokeObjectURL(originalUrlRef.current);
      }

      if (processedUrlRef.current) {
        URL.revokeObjectURL(processedUrlRef.current);
      }
    };
  }, []);

  function replaceOriginalPreview(file: File) {
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    originalUrlRef.current = previewUrl;
    setOriginalPreview(previewUrl);
  }

  function replaceProcessedPreview(blob: Blob) {
    if (processedUrlRef.current) {
      URL.revokeObjectURL(processedUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(blob);
    processedUrlRef.current = previewUrl;
    setProcessedPreview(previewUrl);
  }

  function clearProcessedPreview() {
    if (processedUrlRef.current) {
      URL.revokeObjectURL(processedUrlRef.current);
      processedUrlRef.current = null;
    }

    setProcessedPreview(null);
  }

  function handleReceiptSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please select a receipt image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Please select an image smaller than 15 MB.");
      event.target.value = "";
      return;
    }

    setReceiptFile(file);
    replaceOriginalPreview(file);
    clearProcessedPreview();

    setOcrResult(null);
    setProgress(0);
    setStatus("Ready to scan");
  }

  function clearReceipt() {
    if (isScanning) {
      return;
    }

    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
      originalUrlRef.current = null;
    }

    clearProcessedPreview();

    setReceiptFile(null);
    setOriginalPreview(null);
    setOcrResult(null);
    setProgress(0);
    setStatus("Waiting for a receipt");
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function scanReceipt() {
    if (!receiptFile || isScanning) {
      return;
    }

    setIsScanning(true);
    setError(null);
    setOcrResult(null);
    setProgress(0);

    try {
      setStatus("Enhancing receipt image");

      const processedImage = await preprocessReceiptImage(receiptFile);
      replaceProcessedPreview(processedImage.blob);

      const result = await runReceiptOcr(
        processedImage.blob,
        ({ phase, status: workerStatus, overallProgress }) => {
          const phaseName =
            phase === "loading"
              ? "Loading OCR"
              : phase === "layout"
                ? "Automatic layout scan"
                : phase === "structured"
                  ? "Structured scan"
                  : "Recovery scan";

          setStatus(`${phaseName}: ${formatStatus(workerStatus)}`);
          setProgress(overallProgress);
        },
      );

      setOcrResult(result);
      setProgress(100);
      setStatus("Three-pass scan completed");
    } catch (scanError) {
      console.error("Receipt OCR failed:", scanError);

      setError(
        scanError instanceof Error
          ? scanError.message
          : "The receipt could not be scanned.",
      );

      setStatus("Scan failed");
      setProgress(0);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-12 text-zinc-100">
      <div className="mx-auto w-full max-w-lg">
        <header className="flex items-center gap-3 py-5">
          <Link
            href="/expenses"
            className="flex size-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800"
            aria-label="Back to expenses"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <div>
            <h1 className="text-xl font-semibold">Receipt OCR Test</h1>
            <p className="text-sm text-zinc-500">
              Test recognition before expense integration
            </p>
          </div>
        </header>

        <section className="mb-4 flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />

          <div>
            <p className="text-sm font-medium text-emerald-200">
              Processed on this device
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-200/70">
              The receipt is not uploaded to SplitHutang, Supabase or an AI
              service.
            </p>
          </div>
        </section>

        <input
          ref={fileInputRef}
          id="receipt-image"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleReceiptSelected}
          className="sr-only"
        />

        {!originalPreview ? (
          <label
            htmlFor="receipt-image"
            className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/60 px-6 text-center transition hover:border-zinc-500 hover:bg-zinc-900"
          >
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-violet-500/15 text-violet-400">
              <Camera className="size-8" />
            </div>

            <p className="font-medium">Take or choose a receipt photo</p>

            <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-500">
              Keep the receipt flat, fill the frame and avoid shadows over the
              item prices.
            </p>
          </label>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <p className="text-sm font-medium">Original image</p>
              </div>

              <div className="relative flex max-h-96 justify-center bg-black">
                <Image
                  src={originalPreview}
                  alt="Original receipt"
                  width={1200}
                  height={1600}
                  unoptimized
                  className="max-h-96 w-auto object-contain"
                />
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={scanReceipt}
                disabled={isScanning}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isScanning ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <ScanLine className="size-5" />
                )}

                {isScanning ? "Scanning..." : "Scan receipt"}
              </button>

              <button
                type="button"
                onClick={clearReceipt}
                disabled={isScanning}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="size-5" />
                Start over
              </button>
            </div>
          </div>
        )}

        {(isScanning || progress > 0) && (
          <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="truncate text-sm text-zinc-300">{status}</p>
              <p className="text-sm font-medium text-violet-400">{progress}%</p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </section>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {processedPreview && (
          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-sm font-medium">Processed image</p>
              <p className="mt-1 text-xs text-zinc-500">
                This is the image given to Tesseract.
              </p>
            </div>

            <div className="relative flex max-h-96 justify-center bg-black">
              <Image
                src={processedPreview}
                alt="Processed receipt"
                width={1200}
                height={1600}
                unoptimized
                className="max-h-96 w-auto object-contain"
              />
            </div>
          </section>
        )}

        {ocrResult && (
          <section className="mt-4 space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
            <div>
              <h2 className="font-medium">Three-pass OCR result</h2>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Positioned words remain only in memory and will be used by the
                receipt parser.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-zinc-950 p-3 text-center">
                <p className="text-lg font-semibold text-violet-400">
                  {ocrResult.layout.confidence}%
                </p>
                <p className="mt-1 text-xs text-zinc-500">Automatic</p>
              </div>
              <div className="rounded-2xl bg-zinc-950 p-3 text-center">
                <p className="text-lg font-semibold text-violet-400">
                  {ocrResult.structured.confidence}%
                </p>
                <p className="mt-1 text-xs text-zinc-500">Structured</p>
              </div>

              <div className="rounded-2xl bg-zinc-950 p-3 text-center">
                <p className="text-lg font-semibold text-violet-400">
                  {ocrResult.recovery.confidence}%
                </p>
                <p className="mt-1 text-xs text-zinc-500">Recovery</p>
              </div>

              <div className="rounded-2xl bg-zinc-950 p-3 text-center">
                <p className="text-lg font-semibold text-violet-400">
                  {ocrResult.durationSeconds.toFixed(1)}s
                </p>
                <p className="mt-1 text-xs text-zinc-500">Total time</p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium">Automatic layout pass</h3>

                  <p className="mt-1 text-xs text-zinc-500">
                    Primary source for merchant and receipt summary
                  </p>
                </div>

                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                  {ocrResult.layout.words.length} words
                </span>
              </div>

              <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-zinc-300">
                {ocrResult.layout.text || "No text detected."}
              </pre>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium">Structured pass</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Primary source for rows and quantities
                  </p>
                </div>

                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                  {ocrResult.structured.words.length} words
                </span>
              </div>

              <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-zinc-300">
                {ocrResult.structured.text || "No text detected."}
              </pre>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium">
                    Reconstructed visual rows
                  </h3>

                  <p className="mt-1 text-xs text-zinc-500">
                    Words regrouped using their positions on the receipt
                  </p>
                </div>

                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                  {structuredRows.length} rows
                </span>
              </div>

              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-zinc-300">
                {reconstructedRowText || "No visual rows reconstructed."}
              </pre>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium">Recovery pass</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Secondary source for missing prices
                  </p>
                </div>

                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                  {ocrResult.recovery.words.length} words
                </span>
              </div>

              <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-zinc-300">
                {ocrResult.recovery.text || "No text detected."}
              </pre>
            </div>

            {receiptSummary && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-medium">
                    Parsed receipt summary
                  </h3>

                  <p className="mt-1 text-xs text-zinc-500">
                    First deterministic parser checkpoint
                  </p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-zinc-500">Merchant</span>
                    <span className="text-right text-zinc-200">
                      {receiptSummary.merchant?.value ?? "Needs review"}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-zinc-500">Date</span>
                    <span className="text-right text-zinc-200">
                      {receiptSummary.receiptDate
                        ? `${receiptSummary.receiptDate.value.date}${
                            receiptSummary.receiptDate.value.time
                              ? ` ${receiptSummary.receiptDate.value.time}`
                              : ""
                          }`
                        : "Needs review"}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-zinc-500">Subtotal</span>
                    <span className="text-right text-zinc-200">
                      {receiptSummary.subtotal
                        ? `RM${receiptSummary.subtotal.value.toFixed(2)}`
                        : "Needs review"}
                    </span>
                  </div>

                  {receiptSummary.serviceCharge && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-zinc-500">Service charge</span>
                      <span className="text-right text-zinc-200">
                        RM
                        {receiptSummary.serviceCharge.value.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {receiptSummary.tax && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-zinc-500">Tax</span>
                      <span className="text-right text-zinc-200">
                        RM{receiptSummary.tax.value.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {receiptSummary.rounding && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-zinc-500">Rounding</span>
                      <span className="text-right text-zinc-200">
                        RM{receiptSummary.rounding.value.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-zinc-800 pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-medium text-zinc-300">
                        Selected total
                      </span>
                      <span className="text-lg font-semibold text-violet-400">
                        {receiptSummary.total
                          ? `RM${receiptSummary.total.value.toFixed(2)}`
                          : "Needs review"}
                      </span>
                    </div>
                  </div>
                </div>

                {receiptSummary.warnings.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <p className="mb-2 text-xs font-medium text-amber-300">
                      Review required
                    </p>

                    <ul className="space-y-1 text-xs leading-5 text-amber-200/80">
                      {receiptSummary.warnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {receiptSummary && matchedReceiptItems && (
              <ReceiptReviewEditor
                summary={receiptSummary}
                matchResult={matchedReceiptItems}
              />
            )}

            {itemCandidateAnalysis && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
                <div className="border-b border-zinc-800 px-4 py-3">
                  <h3 className="text-sm font-medium">
                    Item candidate analysis
                  </h3>

                  <p className="mt-1 text-xs text-zinc-500">
                    Ordered descriptions and price-column values before matching
                  </p>
                </div>

                <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-zinc-300">
                  {itemCandidateDebugText || "No item candidates detected."}
                </pre>

                {itemCandidateAnalysis.warnings.length > 0 && (
                  <div className="border-t border-zinc-800 p-4">
                    <ul className="space-y-1 text-xs text-amber-300">
                      {itemCandidateAnalysis.warnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {alternatePriceDebugText && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Alternate OCR price candidates
                </h2>

                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {alternatePriceDebugText}
                </pre>
              </section>
            )}
            {fusedPriceDebugText && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Fused price candidates
                </h2>

                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {fusedPriceDebugText}
                </pre>
              </section>
            )}
            {perUnitDebugText && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Per-unit price evidence
                </h2>

                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {perUnitDebugText}
                </pre>
              </section>
            )}
            {groupedNameDebugText && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Grouped receipt names
                </h2>

                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {groupedNameDebugText}
                </pre>
              </section>
            )}
            {matchedItemsDebugText && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Matched receipt items
                </h2>

                <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {matchedItemsDebugText}
                </pre>
              </section>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
