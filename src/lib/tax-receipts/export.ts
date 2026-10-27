import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { buildYearSummary, categoryLabels } from "./rules.ts";
import { statusLabels, type AssessedReceipt, type TaxReceipt } from "./model.ts";
import { receiptMimeExtensions } from "./validation.ts";

// Neutralise spreadsheet formula prefixes, including whitespace/control tricks.
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function csv(rows: unknown[][]) { return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"); }
const amount = (cents: number) => (cents / 100).toFixed(2);
export function archiveReceiptPath(receipt: AssessedReceipt) {
  const categories = [...new Set(receipt.assessments.map((item) => item.category).filter(Boolean))];
  const folder = categories.length === 1 ? categoryLabels[categories[0]!] : "Mixed-or-unclassified";
  return `receipts/${folder}/${receipt.purchaseDate}_${receipt.id}.${receiptMimeExtensions[receipt.fileMime]}`;
}
export function exportDocuments(summary: ReturnType<typeof buildYearSummary>, selected: AssessedReceipt[]) {
  const summaryCsv = csv([
    ["Assessment year", "Category", "Eligible before annual limit (RM)", "Annual limit (RM)", "Estimated relief (RM)", "Remaining (RM)", "Over limit (RM)"],
    ...summary.categories.map((category) => [summary.year, category.label, amount(category.eligibleCents), category.limitCents === null ? "Not verified" : amount(category.limitCents), amount(category.estimatedClaimCents), category.remainingCents === null ? "Not verified" : amount(category.remainingCents), amount(category.excessCents)]),
  ]);
  const indexCsv = csv([
    ["Receipt ID", "Purchase date", "Assessment year", "Merchant", "Receipt total (RM)", "Eligible before annual limit (RM)", "Estimated relief after annual limit (RM)", "Status", "Rules version", "Original file", "Notes"],
    ...selected.map((receipt) => [receipt.id, receipt.purchaseDate, receipt.assessmentYear, receipt.merchant, amount(receipt.totalCents), amount(receipt.eligibleCents), amount(receipt.estimatedClaimCents), statusLabels[receipt.status], receipt.rulesVersion, archiveReceiptPath(receipt), receipt.notes]),
  ]);
  const itemsCsv = csv([
    ["Receipt ID", "Description", "Purchase type", "Beneficiary", "Amount checked (RM)", "Eligible before annual limit (RM)", "Status", "Explanation / next step"],
    ...selected.flatMap((receipt) => receipt.items.map((item, i) => [receipt.id, item.description, item.kind, item.beneficiary, amount(item.amountCents), amount(receipt.assessments[i].eligibleCents), statusLabels[receipt.assessments[i].status], receipt.assessments[i].reasons.join(" ")])),
  ]);
  const readme = `SplitHutang Tax receipts — assessment year ${summary.year}\n\nThis is a personal evidence pack, not a filed return or LHDN approval.\nAmounts are relief estimates, not tax refunds. Only Lifestyle and Sports are assessed for supported years. Other expenses and unresolved answers need separate review.\n\nsummary.csv covers ALL active receipts in this year, even when the archive's originals are filtered to claim-related receipts. receipt-index.csv lists the originals included; item-details.csv explains each assessed portion. Annual limits are shared across all receipts and allocated by purchase date then receipt ID.\n\nReview any claims recorded outside SplitHutang and any joint-assessment conditions before filing. Receipts, answers and amounts were supplied by the user. Original files have not been OCR processed or altered.\n\nSource: ${summary.rules?.source ?? "No verified rule set for this year"}\nRule source: ${summary.rules?.reference ?? "Unreviewed"}\n\nKeep records for the required retention period. LHDN's individual FAQ describes seven years from the end of the year the return was submitted. This app does not automatically delete records when a year ends.\n`;
  return { "summary.csv": strToU8(summaryCsv), "receipt-index.csv": strToU8(indexCsv), "item-details.csv": strToU8(itemsCsv), "README.txt": strToU8(readme) };
}

export function createYearArchive(
  receipts: TaxReceipt[], year: number, scope: "all" | "claims",
  loadFile: (id: string) => Promise<{ bytes: Uint8Array }>,
) {
  const summary = buildYearSummary(receipts.filter((receipt) => !receipt.deletedAt), year);
  const selected = summary.receipts.filter((receipt) => scope === "all" || receipt.eligibleCents > 0);
  const files = Object.entries(exportDocuments(summary, selected));
  let index = 0;
  let cancelled = false;
  let zip: Zip;
  // Pull-driven, uncompressed ZIP: at most one receipt is fetched at a time,
  // honouring stream backpressure instead of buffering a whole year's originals.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((error, chunk, final) => {
        if (cancelled) return;
        if (error) { cancelled = true; controller.error(new Error("Unable to create receipt archive.")); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
    },
    async pull(controller) {
      if (cancelled) return;
      try {
        if (index < files.length) {
          const [path, bytes] = files[index++];
          const file = new ZipPassThrough(path);
          zip.add(file); file.push(bytes, true);
        } else if (index - files.length < selected.length) {
          const receipt = selected[index++ - files.length];
          const { bytes } = await loadFile(receipt.id);
          if (cancelled) return;
          const file = new ZipPassThrough(archiveReceiptPath(receipt));
          zip.add(file); file.push(bytes, true);
        } else { zip.end(); cancelled = true; }
      } catch {
        if (!cancelled) { cancelled = true; zip.terminate(); controller.error(new Error("A receipt could not be downloaded. Discard this incomplete archive and try again.")); }
      }
    },
    cancel() { cancelled = true; zip.terminate(); },
  });
  return stream;
}
