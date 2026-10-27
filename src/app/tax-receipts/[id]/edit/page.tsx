import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireFeatureAccess } from "@/lib/features/server";
import { openTaxReceiptStore } from "@/lib/tax-receipts/server";
import { TaxReceiptError } from "@/lib/tax-receipts/validation";
import { ReceiptForm } from "@/components/tax-receipts/receipt-form";
import { TaxHeader } from "@/components/tax-receipts/tax-header";
export const metadata: Metadata = { title: "Check a tax receipt" };
export const dynamic = "force-dynamic";
export default async function EditTaxReceiptPage({ params }: PageProps<"/tax-receipts/[id]/edit">) {
  await requireFeatureAccess("tax_receipts");
  const store = await openTaxReceiptStore();
  const { id } = await params;
  let receipt;
  try { receipt = await store.get(id); }
  catch (error) { if (error instanceof TaxReceiptError && error.status === 404) notFound(); throw error; }
  return <><TaxHeader title="Check your receipt" subtitle="Update details and resolve missing answers" /><ReceiptForm initialReceipt={receipt} /></>;
}
