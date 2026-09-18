"use client";

import Image from "next/image";
import { Download, Expand, QrCode, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useHistoryOverlay } from "@/hooks/use-history-overlay";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { createClient } from "@/lib/supabase/client";

type PaymentQrPanelProps = {
  paymentQrPath: string | null;
  receiverName: string;
  emptyMessage?: string;
};

function downloadFileName(receiverName: string, mimeType: string) {
  const safeName = receiverName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "payment";

  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";

  return `${safeName}-payment-qr.${extension}`;
}

export function PaymentQrPanel({
  paymentQrPath,
  receiverName,
  emptyMessage,
}: PaymentQrPanelProps) {
  if (!paymentQrPath) {
    return (
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div className="flex items-start gap-3">
          <QrCode className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">No payment QR available</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {emptyMessage ??
                `${receiverName} hasn’t saved a payment QR yet. Ask them for their payment details before transferring.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LoadedPaymentQr
      key={paymentQrPath}
      paymentQrPath={paymentQrPath}
      receiverName={receiverName}
    />
  );
}

type LoadedPaymentQrProps = {
  paymentQrPath: string;
  receiverName: string;
};

function LoadedPaymentQr({
  paymentQrPath,
  receiverName,
}: LoadedPaymentQrProps) {
  const supabase = useMemo(() => createClient(), []);
  const online = useOnlineStatus();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const {
    open: fullScreen,
    openOverlay: openFullScreen,
    dismiss: closeFullScreen,
  } = useHistoryOverlay("payment-qr-preview");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("payment-qr.png");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"offline" | "failed" | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function loadQr() {
      setLoading(true);
      setLoadError(null);
      setDownloadMessage(null);

      if (!navigator.onLine) {
        setLoadError("offline");
        setLoading(false);
        return;
      }

      const { data, error: downloadError } = await supabase.storage
        .from("payment-qrs")
        .download(paymentQrPath);

      if (!active) return;

      if (downloadError || !data) {
        setLoadError(navigator.onLine ? "failed" : "offline");
        setLoading(false);
        return;
      }

      objectUrl = URL.createObjectURL(data);
      setFileName(downloadFileName(receiverName, data.type));
      setImageBlob(data);
      setImageUrl(objectUrl);
      setLoading(false);
    }

    void loadQr();

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [loadAttempt, paymentQrPath, receiverName, supabase]);

  useEffect(() => {
    if (!fullScreen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFullScreen();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [closeFullScreen, fullScreen]);

  function downloadQr() {
    setDownloadMessage(null);

    if (!imageBlob || !imageUrl) {
      setDownloadMessage({
        type: "error",
        text: "Unable to download this QR. Reload it and try again.",
      });
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadMessage({
        type: "success",
        text: "QR download started.",
      });
    } catch (error) {
      console.error("Unable to download payment QR:", error);
      setDownloadMessage({
        type: "error",
        text: "Unable to download this QR. Try opening it full screen and save the image instead.",
      });
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
      <div className="flex items-start gap-3">
        <QrCode className="mt-0.5 size-5 shrink-0 text-blue-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-100">
            Pay {receiverName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-blue-200/70">
            Download the QR, then choose it from your bank app&apos;s gallery.
          </p>
        </div>
      </div>

      {loading && (
        <div className="mt-4" role="status" aria-label="Loading payment QR">
          <div className="h-56 animate-pulse rounded-2xl bg-white/[0.06]" />
          <p className="mt-2 text-center text-xs text-blue-200/70">
            Loading payment QR...
          </p>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-red-500/10 px-3 py-3 text-xs text-red-300"
        >
          <div className="flex items-start gap-2">
            {loadError === "offline" ? (
              <WifiOff className="mt-0.5 size-4 shrink-0" />
            ) : (
              <QrCode className="mt-0.5 size-4 shrink-0" />
            )}
            <p>
              {loadError === "offline"
                ? "You’re offline. Reconnect to load this payment QR."
                : "Unable to load this payment QR. Check your connection and try again."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            disabled={!online}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white/[0.06] font-semibold disabled:opacity-40"
          >
            <RefreshCw className="size-3.5" />
            Try again
          </button>
        </div>
      )}

      {imageUrl && (
        <>
          <button
            type="button"
            onClick={openFullScreen}
            aria-label={`View ${receiverName} payment QR full screen`}
            className="group mx-auto mt-4 block max-w-64 overflow-hidden rounded-2xl bg-white p-3 text-left"
          >
            <Image
              src={imageUrl}
              alt={`${receiverName} payment QR`}
              width={512}
              height={512}
              unoptimized
              className="h-auto w-full object-contain"
            />
            <span className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700">
              <Expand className="size-3.5" />
              View full screen
            </span>
          </button>

          <button
            type="button"
            onClick={downloadQr}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Download className="size-4" />
            Download QR
          </button>

          {downloadMessage && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-2 text-center text-xs ${
                downloadMessage.type === "success"
                  ? "text-emerald-300"
                  : "text-red-300"
              }`}
            >
              {downloadMessage.text}
            </p>
          )}

          {fullScreen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${receiverName} payment QR full-screen preview`}
              className="fixed inset-0 z-[100] flex flex-col bg-black/95 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]"
            >
              <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
                <div>
                  <p className="font-bold">Pay {receiverName}</p>
                  <p className="text-xs text-zinc-400">Payment QR</p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeFullScreen}
                  aria-label="Close full-screen QR preview"
                  className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center py-5">
                <div className="max-h-full w-full max-w-md overflow-hidden rounded-3xl bg-white p-4">
                  <Image
                    src={imageUrl}
                    alt={`${receiverName} payment QR full screen`}
                    width={1024}
                    height={1024}
                    unoptimized
                    className="max-h-[70dvh] h-auto w-full object-contain"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={downloadQr}
                className="mx-auto flex h-12 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-blue-600 font-semibold text-white"
              >
                <Download className="size-4" />
                Download QR
              </button>
              {downloadMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mx-auto mt-2 max-w-md text-center text-xs ${
                    downloadMessage.type === "success"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }`}
                >
                  {downloadMessage.text}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
