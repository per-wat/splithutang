import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getFeatureAccess } from "@/lib/features/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rulesVersionForYear } from "@/lib/tax-receipts/rules";
import { receiptMimeExtensions, TaxReceiptError, validId, validateReceiptFile, parseReceiptInput } from "@/lib/tax-receipts/validation";
import type { TaxReceipt, ReceiptInput, ReceiptItem, ReceiptAnswers } from "@/lib/tax-receipts/model";
import type { Database } from "@/types/database";

type Row = Database["public"]["Tables"]["tax_receipts"]["Row"];
const bucket = "tax-receipts";
const columns = "id,user_id,merchant,purchase_date,assessment_year,total_cents,items,answers,rules_version,notes,file_path,file_mime,file_size,file_sha256,revision,deleted_at,created_at,updated_at";
function receiptFromRow(row: Row): TaxReceipt {
  return {
    id: row.id, merchant: row.merchant, purchaseDate: row.purchase_date,
    assessmentYear: row.assessment_year, totalCents: row.total_cents,
    items: row.items as unknown as ReceiptItem[], answers: row.answers as unknown as ReceiptAnswers,
    rulesVersion: row.rules_version, notes: row.notes, fileMime: row.file_mime,
    fileSize: row.file_size, revision: row.revision, createdAt: row.created_at, deletedAt: row.deleted_at,
  };
}
function metadata(input: ReceiptInput) {
  return {
    merchant: input.merchant, purchase_date: input.purchaseDate, total_cents: input.totalCents,
    items: input.items, answers: input.answers, notes: input.notes,
    rules_version: rulesVersionForYear(Number(input.purchaseDate.slice(0, 4))),
  };
}
function failure(message: string, error?: unknown): never {
  // Never log receipt contents, names, amounts or storage credentials.
  if (error) console.error(message);
  throw new TaxReceiptError(message, 503);
}

// Only this factory constructs the privileged store. No caller-supplied UID and
// no creator exception to ownership. Each public method closes over session UID.
export async function openTaxReceiptStore() {
  let access: Awaited<ReturnType<typeof getFeatureAccess>>;
  try { access = await getFeatureAccess(); }
  catch { throw new TaxReceiptError("Unable to check access. Please try again.", 503); }
  if (!access.user) throw new TaxReceiptError("Sign in is required.", 401);
  if (!access.featureKeys.includes("tax_receipts")) throw new TaxReceiptError("You do not have access to Tax receipts.", 403);
  const userId = access.user.id;
  const admin = createAdminClient();

  async function getRow(id: string, includeDeleted = false) {
    if (!validId(id)) throw new TaxReceiptError("Receipt not found.", 404);
    const { data, error } = await admin.from("tax_receipts").select(columns).eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) failure("Unable to load this receipt. Please try again.", error);
    if (!data || (!includeDeleted && data.deleted_at)) throw new TaxReceiptError("Receipt not found.", 404);
    return data;
  }

  return {
    async get(id: string) { return receiptFromRow(await getRow(id)); },
    async list(year: number) {
      const result: TaxReceipt[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await admin.from("tax_receipts").select(columns)
          .eq("user_id", userId).eq("assessment_year", year)
          .order("purchase_date").order("id").range(offset, offset + 499);
        if (error) failure("Unable to load receipts. Please try again.", error);
        result.push(...(data ?? []).map(receiptFromRow));
        if (!data || data.length < 500) return result;
      }
    },
    async create(input: ReceiptInput, bytes: Uint8Array, mime: string) {
      input = parseReceiptInput(input);
      validateReceiptFile(bytes, mime);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const { data: existing, error: duplicateError } = await admin.from("tax_receipts").select("id").eq("user_id", userId).eq("file_sha256", hash).maybeSingle();
      if (duplicateError) failure("Unable to check for duplicate receipts. Please try again.", duplicateError);
      if (existing) throw new TaxReceiptError("This file is already saved. Find the existing receipt to edit it, or finish a pending deletion.", 409);
      const id = randomUUID();
      const path = `${userId}/${id}/receipt.${receiptMimeExtensions[mime]}`;
      const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
      if (uploadError) failure("Unable to upload the receipt. Please try again.", uploadError);
      const { data, error } = await admin.from("tax_receipts").insert({
        id, user_id: userId, ...metadata(input), file_path: path,
        file_mime: mime, file_size: bytes.length, file_sha256: hash,
      }).select(columns).single();
      if (error || !data) {
        // Resolve an ambiguous insert response before removing its file. If the
        // lookup is unavailable, keep the private original for reconciliation.
        const { data: saved, error: lookupError } = await admin.from("tax_receipts").select(columns).eq("user_id", userId).eq("id", id).maybeSingle();
        if (saved) return receiptFromRow(saved);
        if (!lookupError) {
          const { error: cleanupError } = await admin.storage.from(bucket).remove([path]);
          if (cleanupError) console.error("Tax receipt upload cleanup needs retry.");
        }
        failure("Unable to confirm the receipt was saved. Reload your receipts before trying again.", error);
      }
      return receiptFromRow(data);
    },
    async update(id: string, input: ReceiptInput, revision: number) {
      await getRow(id);
      input = parseReceiptInput(input);
      const { data, error } = await admin.from("tax_receipts").update({ ...metadata(input), revision: revision + 1, updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("id", id).eq("revision", revision).is("deleted_at", null).select(columns).maybeSingle();
      if (error) failure("Unable to save receipt changes. Please try again.", error);
      if (!data) throw new TaxReceiptError("This receipt changed in another tab. Reload before editing again.", 409);
      return receiptFromRow(data);
    },
    async remove(id: string) {
      const row = await getRow(id, true);
      // Hide data and deny file downloads immediately. A failed cleanup stays
      // visible as Deletion pending so the user can retry, with no lost record.
      const { data: marked, error: markError } = await admin.from("tax_receipts").update({ deleted_at: new Date().toISOString(), revision: row.revision + 1 })
        .eq("user_id", userId).eq("id", id).eq("revision", row.revision).select("id").maybeSingle();
      if (markError) failure("Unable to remove the receipt. Please try again.", markError);
      if (!marked) throw new TaxReceiptError("This receipt changed. Reload before deleting.", 409);
      if (row.file_path !== `${userId}/${row.id}/receipt.${receiptMimeExtensions[row.file_mime]}`) failure("The stored receipt path needs checking.");
      const { error: fileError } = await admin.storage.from(bucket).remove([row.file_path]);
      if (fileError) failure("Deletion is pending. Reload and retry deleting to finish removing the file.", fileError);
      const { error: deleteError } = await admin.from("tax_receipts").delete().eq("user_id", userId).eq("id", id).not("deleted_at", "is", null);
      if (deleteError) failure("The file was removed. Reload and retry deleting to remove its record.", deleteError);
    },
    async file(id: string) {
      const row = await getRow(id);
      // Fail closed even if an administrator accidentally edited a stored path.
      const expected = `${userId}/${row.id}/receipt.${receiptMimeExtensions[row.file_mime]}`;
      if (row.file_path !== expected) failure("The stored receipt path needs checking.");
      const { data, error } = await admin.storage.from(bucket).download(row.file_path);
      if (error || !data) failure("Unable to download this receipt. Please try again.", error);
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== row.file_sha256) failure("Receipt integrity check failed. The download was stopped.");
      return { receipt: receiptFromRow(row), bytes, mime: row.file_mime };
    },
  };
}
