import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InstallmentCalculator } from "@/components/installment/installment-calculator";
import { AppBackButton } from "@/components/layout/app-back-button";
import { AppMenu } from "@/components/layout/app-menu";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Installment Calculator" };

export default async function InstallmentCalculatorPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background px-5 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Installment Calculator</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Estimate before you convert a purchase</p>
          </div>
        </div>
        <AppMenu />
      </header>

      <InstallmentCalculator />
    </>
  );
}
