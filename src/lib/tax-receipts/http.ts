import "server-only";
import { TaxReceiptError } from "@/lib/tax-receipts/validation";
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export function taxError(error: unknown) {
  if (error instanceof TaxReceiptError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  console.error("Tax receipts request failed.");
  return Response.json({ error: "Unable to complete this request. Please try again." }, { status: 503, headers: privateHeaders });
}
