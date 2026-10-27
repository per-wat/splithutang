import { openTaxReceiptStore } from "@/lib/tax-receipts/server";
import { buildYearSummary } from "@/lib/tax-receipts/rules";
import { privateHeaders, taxError } from "@/lib/tax-receipts/http";
import { MAX_RECEIPT_BYTES, parseReceiptInput, parseYear, TaxReceiptError } from "@/lib/tax-receipts/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const store = await openTaxReceiptStore();
    const year = parseYear(new URL(request.url).searchParams.get("year"));
    return Response.json(buildYearSummary(await store.list(year), year), { headers: privateHeaders });
  } catch (error) { return taxError(error); }
}
export async function POST(request: Request) {
  try {
    const store = await openTaxReceiptStore();
    if (Number(request.headers.get("content-length")) > MAX_RECEIPT_BYTES + 65_536) throw new TaxReceiptError("Choose a receipt file up to 3 MB.", 413);
    let form: FormData;
    try { form = await request.formData(); } catch { throw new TaxReceiptError("Receipt upload is invalid."); }
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_RECEIPT_BYTES) throw new TaxReceiptError("Choose a receipt file up to 3 MB.", 413);
    let payload: unknown;
    try { payload = JSON.parse(String(form.get("details"))); } catch { throw new TaxReceiptError("Receipt details are invalid."); }
    const receipt = await store.create(parseReceiptInput(payload), new Uint8Array(await file.arrayBuffer()), file.type);
    return Response.json({ receipt }, { status: 201, headers: privateHeaders });
  } catch (error) { return taxError(error); }
}
