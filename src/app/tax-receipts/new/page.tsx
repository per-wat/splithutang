import type { Metadata } from "next";
import { requireFeatureAccess } from "@/lib/features/server";
import { ReceiptForm } from "@/components/tax-receipts/receipt-form";
import { TaxHeader } from "@/components/tax-receipts/tax-header";
export const metadata: Metadata = { title: "Save a tax receipt" };
export const dynamic = "force-dynamic";
export default async function NewTaxReceiptPage() {
  await requireFeatureAccess("tax_receipts");
  return <><TaxHeader title="Save a receipt" subtitle="You can finish checking it later" /><ReceiptForm /></>;
}
