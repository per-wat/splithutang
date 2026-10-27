import { openTaxReceiptStore } from "@/lib/tax-receipts/server";
import { privateHeaders, taxError } from "@/lib/tax-receipts/http";
import { receiptMimeExtensions } from "@/lib/tax-receipts/validation";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: RouteContext<"/api/tax-receipts/[id]/file">) {
  try {
    const store = await openTaxReceiptStore();
    const { id } = await context.params;
    const { bytes, receipt, mime } = await store.file(id);
    return new Response(bytes as BodyInit, { headers: { ...privateHeaders,
      "Content-Type": mime, "Content-Disposition": `attachment; filename="receipt-${receipt.purchaseDate}-${receipt.id}.${receiptMimeExtensions[mime]}"`,
    } });
  } catch (error) { return taxError(error); }
}
