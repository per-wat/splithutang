import { answers, beneficiaries, malaysiaToday, purchaseKinds, type ReceiptInput, type ReceiptItem } from "./model.ts";

export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
export const receiptMimeExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export class TaxReceiptError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function validId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown, max: number, required = false) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new TaxReceiptError("Check the text fields and their length limits.");
  return value.trim();
}
function cents(value: unknown, allowZero: boolean) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 100_000_000) throw new TaxReceiptError("Enter a valid amount in ringgit, with up to two decimal places.");
  return value;
}
export function parseReceiptInput(value: unknown, today = malaysiaToday()): ReceiptInput {
  if (!record(value) || !record(value.answers)) throw new TaxReceiptError("Receipt details are invalid.");
  const date = text(value.purchaseDate, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "2000-01-01" || date > today || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new TaxReceiptError("Choose a valid purchase date from 2000 up to today.");
  const totalCents = cents(value.totalCents, false);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 20) throw new TaxReceiptError("Add between 1 and 20 portions to check.");
  const items: ReceiptItem[] = value.items.map((item) => {
    if (!record(item) || !purchaseKinds.includes(item.kind as never) || !beneficiaries.includes(item.beneficiary as never) || !answers.includes(item.conditionMet as never) || !answers.includes(item.parentResident as never)) throw new TaxReceiptError("Choose valid item details and answers.");
    return { kind: item.kind as ReceiptItem["kind"], description: text(item.description, 160), amountCents: cents(item.amountCents, true), beneficiary: item.beneficiary as ReceiptItem["beneficiary"], conditionMet: item.conditionMet as ReceiptItem["conditionMet"], parentResident: item.parentResident as ReceiptItem["parentResident"] };
  });
  if (items.reduce((sum, item) => sum + item.amountCents, 0) > totalCents) throw new TaxReceiptError("The portions being checked cannot add up to more than the receipt total.");
  if (![value.answers.resident, value.answers.ownExpense, value.answers.claimOnce].every((answer) => answers.includes(answer as never))) throw new TaxReceiptError("Answer the receipt questions, or choose Not sure.");
  return {
    merchant: text(value.merchant, 120, true), purchaseDate: date, totalCents, items,
    answers: { resident: value.answers.resident as ReceiptInput["answers"]["resident"], ownExpense: value.answers.ownExpense as ReceiptInput["answers"]["ownExpense"], claimOnce: value.answers.claimOnce as ReceiptInput["answers"]["claimOnce"] },
    notes: text(value.notes ?? "", 1000),
  };
}
export function validateReceiptFile(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES) throw new TaxReceiptError("Choose a receipt file up to 3 MB.", 413);
  const signature = Array.from(bytes.slice(0, 12));
  const matches = mime === "image/jpeg" ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
    : mime === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => signature[i] === byte)
    : mime === "image/webp" ? String.fromCharCode(...signature.slice(0, 4)) === "RIFF" && String.fromCharCode(...signature.slice(8, 12)) === "WEBP"
    : mime === "application/pdf" ? String.fromCharCode(...signature.slice(0, 5)) === "%PDF-" : false;
  if (!matches) throw new TaxReceiptError("Use a valid JPG, PNG, WebP or PDF receipt. The file content must match its type.");
}
export function parseYear(value: string | null) {
  const currentYear = Number(malaysiaToday().slice(0, 4));
  if (!value || !/^\d{4}$/.test(value) || Number(value) < 2000 || Number(value) > currentYear) throw new TaxReceiptError("Choose a valid assessment year.");
  return Number(value);
}
