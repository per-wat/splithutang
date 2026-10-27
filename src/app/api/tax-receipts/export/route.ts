import { openTaxReceiptStore } from "@/lib/tax-receipts/server";
import { createYearArchive } from "@/lib/tax-receipts/export";
import { privateHeaders, taxError } from "@/lib/tax-receipts/http";
import { parseYear, TaxReceiptError } from "@/lib/tax-receipts/validation";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const store = await openTaxReceiptStore();
    const params = new URL(request.url).searchParams;
    const year = parseYear(params.get("year"));
    const scope = params.get("scope") ?? "all";
    if (scope !== "all" && scope !== "claims") throw new TaxReceiptError("Choose all receipts or claim-related receipts.");
    const receipts = await store.list(year);
    return new Response(createYearArchive(receipts, year, scope, (id) => store.file(id)), {
      headers: { ...privateHeaders, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="SplitHutang-tax-${year}-${scope}.zip"` },
    });
  } catch (error) { return taxError(error); }
}
