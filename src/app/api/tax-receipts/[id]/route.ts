import { openTaxReceiptStore } from "@/lib/tax-receipts/server";
import { privateHeaders, taxError } from "@/lib/tax-receipts/http";
import { parseReceiptInput, TaxReceiptError } from "@/lib/tax-receipts/validation";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: RouteContext<"/api/tax-receipts/[id]">) {
  try {
    const store = await openTaxReceiptStore();
    let payload;
    try { payload = await request.json(); } catch { throw new TaxReceiptError("Receipt details are invalid."); }
    if (!payload || !Number.isSafeInteger(payload.revision) || payload.revision < 1 || payload.revision >= 2147483647) throw new TaxReceiptError("Reload the receipt before editing.");
    const { id } = await context.params;
    return Response.json({ receipt: await store.update(id, parseReceiptInput(payload), payload.revision) }, { headers: privateHeaders });
  } catch (error) { return taxError(error); }
}
export async function DELETE(_request: Request, context: RouteContext<"/api/tax-receipts/[id]">) {
  try {
    const store = await openTaxReceiptStore();
    const { id } = await context.params;
    await store.remove(id);
    return Response.json({ deleted: true }, { headers: privateHeaders });
  } catch (error) { return taxError(error); }
}
