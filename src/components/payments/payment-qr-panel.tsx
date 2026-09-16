"use client";

import Image from "next/image";
import { Download, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type PaymentQrPanelProps = {
  paymentQrPath: string | null;
  receiverName: string;
  emptyMessage?: string;
  compact?: boolean;
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
  compact = false,
}: PaymentQrPanelProps) {
  if (!paymentQrPath) {
    return (
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div className="flex items-start gap-3">
          <QrCode className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {emptyMessage ?? `${receiverName} hasn’t added a payment QR yet.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <LoadedPaymentQr
      key={paymentQrPath}
      paymentQrPath={paymentQrPath}
      receiverName={receiverName}
      compact={compact}
    />
  );
}

type LoadedPaymentQrProps = {
  paymentQrPath: string;
  receiverName: string;
  compact: boolean;
};

function LoadedPaymentQr({
  paymentQrPath,
  receiverName,
  compact,
}: LoadedPaymentQrProps) {
  const supabase = useMemo(() => createClient(), []);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("payment-qr.png");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function loadQr() {
      const { data, error: downloadError } = await supabase.storage
        .from("payment-qrs")
        .download(paymentQrPath);

      if (!active) return;

      if (downloadError || !data) {
        setError("Unable to load this payment QR.");
        setLoading(false);
        return;
      }

      objectUrl = URL.createObjectURL(data);
      setFileName(downloadFileName(receiverName, data.type));
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
  }, [paymentQrPath, receiverName, supabase]);

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
        <div
          aria-label="Loading payment QR"
          className={`${compact ? "h-40" : "h-56"} mt-4 animate-pulse rounded-2xl bg-white/[0.06]`}
        />
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {imageUrl && (
        <>
          <div
            className={`${compact ? "max-w-44" : "max-w-64"} mx-auto mt-4 overflow-hidden rounded-2xl bg-white p-3`}
          >
            <Image
              src={imageUrl}
              alt={`${receiverName} payment QR`}
              width={512}
              height={512}
              unoptimized
              className="h-auto w-full object-contain"
            />
          </div>

          <a
            href={imageUrl}
            download={fileName}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Download className="size-4" />
            Download QR
          </a>
        </>
      )}
    </section>
  );
}
