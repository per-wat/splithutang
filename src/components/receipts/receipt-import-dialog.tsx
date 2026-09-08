"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";

import { ReceiptReviewEditor } from "@/components/receipts/receipt-review-editor";
import { analyzeReceiptOcr } from "@/lib/receipts/analyze-receipt-ocr";
import type { ReceiptReviewDraft } from "@/lib/receipts/build-receipt-review-draft";
import { preprocessReceiptImage } from "@/lib/receipts/preprocess-receipt";
import {
  runReceiptOcr,
  type ReceiptOcrResult,
} from "@/lib/receipts/run-receipt-ocr";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

type ReceiptImportDialogProps = {
  onClose: () => void;
  onImport: (draft: ReceiptReviewDraft) => void;
};

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ReceiptImportDialog({
  onClose,
  onImport,
}: ReceiptImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<ReceiptOcrResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showDiscardConfirmation, setShowDiscardConfirmation] =
    useState(false);
  const [status, setStatus] = useState("Waiting for a receipt");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const analysis = useMemo(
    () => (ocrResult ? analyzeReceiptOcr(ocrResult) : null),
    [ocrResult],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      scanAbortControllerRef.current?.abort();
      document.body.style.overflow = previousOverflow;

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!receiptFile) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [receiptFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (showDiscardConfirmation) {
        setShowDiscardConfirmation(false);
        return;
      }

      if (isScanning) {
        return;
      }

      if (receiptFile) {
        setShowDiscardConfirmation(true);
      } else {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isScanning, onClose, receiptFile, showDiscardConfirmation]);

  function requestClose() {
    if (isScanning) {
      return;
    }

    if (receiptFile) {
      setShowDiscardConfirmation(true);
      return;
    }

    onClose();
  }

  function cancelScan() {
    if (!isScanning) {
      return;
    }

    setStatus("Cancelling scan");
    scanAbortControllerRef.current?.abort();
  }

  function replacePreview(file: File) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  function handleReceiptSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");

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
    replacePreview(file);
    setOcrResult(null);
    setShowDiscardConfirmation(false);
    setProgress(0);
    setStatus("Ready to scan");
  }

  function resetReceipt() {
    if (isScanning) {
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setReceiptFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setShowDiscardConfirmation(false);
    setProgress(0);
    setStatus("Waiting for a receipt");
    setError("");
  }

  async function scanReceipt() {
    if (!receiptFile || isScanning) {
      return;
    }

    setIsScanning(true);
    setError("");
    setOcrResult(null);
    setProgress(0);

    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;

    try {
      setStatus("Enhancing receipt image");

      const processedImage = await preprocessReceiptImage(receiptFile);
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
        { signal: abortController.signal },
      );

      setOcrResult(result);
      setProgress(100);
      setStatus("Scan completed");
    } catch (scanError) {
      if (abortController.signal.aborted) {
        setProgress(0);
        setStatus("Scan cancelled");
        return;
      }

      console.error("Receipt OCR failed:", scanError);
      setError("The receipt could not be scanned. Please try again.");
      setProgress(0);
      setStatus("Scan failed");
    } finally {
      if (scanAbortControllerRef.current === abortController) {
        scanAbortControllerRef.current = null;
      }

      setIsScanning(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-import-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
    >
      <div className="mx-auto min-h-screen w-full max-w-lg px-4 pb-12">
        <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
          <button
            type="button"
            onClick={requestClose}
            disabled={isScanning}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground disabled:opacity-50"
            aria-label="Close receipt scanner"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h2 id="receipt-import-title" className="font-bold">
              Scan receipt
            </h2>
            <p className="text-xs text-muted-foreground">
              Review everything before importing
            </p>
          </div>
        </header>

        <div className="mt-4 flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              Processed on this device
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-200/70">
              The image and raw OCR text are discarded when this scanner is
              closed.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          id="expense-receipt-image"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleReceiptSelected}
          className="sr-only"
        />

        {!previewUrl ? (
          <label
            htmlFor="expense-receipt-image"
            className="mt-4 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 text-center"
          >
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
              <Camera className="size-8" />
            </div>
            <p className="font-semibold">Take or choose a receipt photo</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Keep the receipt flat, fill the frame and avoid shadows over the
              prices.
            </p>
          </label>
        ) : (
          <>
            <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-card">
              <div className="relative flex max-h-72 justify-center bg-black">
                <Image
                  src={previewUrl}
                  alt="Selected receipt"
                  width={1200}
                  height={1600}
                  unoptimized
                  className="max-h-72 w-auto object-contain"
                />
              </div>
            </div>

            {!analysis && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={scanReceipt}
                  disabled={isScanning}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
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
                  onClick={isScanning ? cancelScan : resetReceipt}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground disabled:opacity-50"
                >
                  {isScanning ? (
                    <X className="size-4" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  {isScanning ? "Cancel scan" : "Choose another"}
                </button>
              </div>
            )}
          </>
        )}

        {(isScanning || progress > 0) && !analysis && (
          <div
            aria-live="polite"
            className="mt-4 rounded-2xl border border-border bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="truncate text-sm text-muted-foreground">{status}</p>
              <p className="text-sm font-semibold text-blue-400">{progress}%</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {analysis && ocrResult && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span>Three-pass scan completed</span>
              <span>{ocrResult.durationSeconds.toFixed(1)} seconds</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={scanReceipt}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground"
              >
                <ScanLine className="size-4" />
                Scan again
              </button>
              <button
                type="button"
                onClick={resetReceipt}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground"
              >
                <RotateCcw className="size-4" />
                Choose another
              </button>
            </div>
            <ReceiptReviewEditor
              summary={analysis.summary}
              matchResult={analysis.matchedItems}
              onConfirm={onImport}
            />
          </div>
        )}
      </div>

      {showDiscardConfirmation && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-receipt-title"
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl"
          >
            <h3 id="discard-receipt-title" className="font-bold">
              Discard this receipt?
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The selected image and any review changes will be removed from
              this device.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirmation(false)}
                className="h-11 rounded-2xl border border-border bg-background px-4 text-sm font-semibold"
              >
                Keep reviewing
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
