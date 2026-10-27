import type { Metadata } from "next";
import { requireFeatureAccess } from "@/lib/features/server";
import { malaysiaToday } from "@/lib/tax-receipts/model";
import { parseYear } from "@/lib/tax-receipts/validation";
import { TaxHeader } from "@/components/tax-receipts/tax-header";
import { TaxReceiptsClient } from "@/components/tax-receipts/tax-receipts-client";
export const metadata: Metadata = { title: "Tax receipts" };
export const dynamic = "force-dynamic";
export default async function TaxReceiptsPage({ searchParams }: PageProps<"/tax-receipts">) {
  await requireFeatureAccess("tax_receipts");
  const params = await searchParams;
  let year = Number(malaysiaToday().slice(0, 4));
  try { if (typeof params.year === "string") year = parseYear(params.year); } catch { /* Default to current year for an invalid bookmark. */ }
  return <><TaxHeader /><TaxReceiptsClient key={year} initialYear={year} /></>;
}
