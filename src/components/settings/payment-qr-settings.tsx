"use client";

import { ImagePlus, QrCode, Save, Trash2 } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";

import { PaymentQrPanel } from "@/components/payments/payment-qr-panel";
import { createClient } from "@/lib/supabase/client";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type PaymentQrSettingsProps = {
  userId: string;
  displayName: string;
  initialPaymentQrPath: string | null;
};

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function PaymentQrSettings({
  userId,
  displayName,
  initialPaymentQrPath,
}: PaymentQrSettingsProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentQrPath, setPaymentQrPath] = useState(initialPaymentQrPath);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function selectQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError("");
    setSuccess("");

    if (!allowedTypes.has(file.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }

    if (pendingPreview) {
      URL.revokeObjectURL(pendingPreview);
    }

    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function saveQr() {
    if (!pendingFile || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const uploadedPath = `${userId}/${crypto.randomUUID()}.${extensionFor(pendingFile)}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("payment-qrs")
        .upload(uploadedPath, pendingFile, {
          cacheControl: "3600",
          contentType: pendingFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase.rpc(
        "update_my_payment_qr",
        { p_payment_qr_path: uploadedPath },
      );

      if (updateError) {
        await supabase.storage.from("payment-qrs").remove([uploadedPath]);
        throw updateError;
      }

      if (paymentQrPath && paymentQrPath !== uploadedPath) {
        const { error: deleteError } = await supabase.storage
          .from("payment-qrs")
          .remove([paymentQrPath]);

        if (deleteError) {
          console.error("Unable to delete the old payment QR:", deleteError);
        }
      }

      if (pendingPreview) {
        URL.revokeObjectURL(pendingPreview);
      }

      setPaymentQrPath(uploadedPath);
      setPendingFile(null);
      setPendingPreview(null);
      setSuccess("Payment QR saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save your payment QR.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeQr() {
    if (!paymentQrPath || removing) return;

    setRemoving(true);
    setError("");
    setSuccess("");

    const pathToRemove = paymentQrPath;
    const { error: updateError } = await supabase.rpc(
      "update_my_payment_qr",
      { p_payment_qr_path: null },
    );

    if (updateError) {
      setError(updateError.message);
      setRemoving(false);
      return;
    }

    const { error: deleteError } = await supabase.storage
      .from("payment-qrs")
      .remove([pathToRemove]);

    if (deleteError) {
      console.error("Unable to delete the payment QR file:", deleteError);
    }

    setPaymentQrPath(null);
    setSuccess("Payment QR removed.");
    setRemoving(false);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/[0.08] bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
            <QrCode className="size-5" />
          </div>
          <div>
            <h2 className="font-bold">Your payment QR</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              People who need to pay you can view and download this QR from
              their payment popup.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={selectQr}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={saving || removing}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] text-sm font-semibold transition-colors hover:bg-white/[0.07] disabled:opacity-50"
        >
          <ImagePlus className="size-4" />
          {paymentQrPath ? "Choose a replacement" : "Choose QR image"}
        </button>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          PNG, JPEG or WebP, up to 5 MB. Use a clear, uncropped QR image.
        </p>
      </section>

      {pendingPreview && (
        <section className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
          <p className="text-sm font-semibold text-blue-100">New QR preview</p>
          <div className="mx-auto mt-4 max-w-64 overflow-hidden rounded-2xl bg-white p-3">
            {/* A local object URL does not need Next.js image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingPreview}
              alt="Selected payment QR preview"
              className="h-auto w-full object-contain"
            />
          </div>
          <button
            type="button"
            onClick={saveQr}
            disabled={saving}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Saving..." : "Save payment QR"}
          </button>
        </section>
      )}

      {!pendingPreview && paymentQrPath && (
        <PaymentQrPanel
          paymentQrPath={paymentQrPath}
          receiverName={displayName}
        />
      )}

      {!pendingPreview && !paymentQrPath && (
        <div className="rounded-2xl border border-dashed border-white/[0.12] px-5 py-8 text-center">
          <QrCode className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">No payment QR saved</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add one so friends can pay you without asking for it separately.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {success && (
        <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </p>
      )}

      {paymentQrPath && !pendingPreview && (
        <button
          type="button"
          onClick={removeQr}
          disabled={removing}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="size-4" />
          {removing ? "Removing..." : "Remove payment QR"}
        </button>
      )}
    </div>
  );
}
