import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppBackButton } from "@/components/layout/app-back-button";
import { AppMenu } from "@/components/layout/app-menu";
import { UsageDashboard } from "@/components/usage/usage-dashboard";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isUsageOwner } from "@/lib/usage/access";
import { getSupabaseUsage } from "@/lib/usage/supabase-usage";

export const metadata: Metadata = {
  title: "Usage",
};

export default async function UsagePage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  if (!isUsageOwner(user.id)) {
    notFound();
  }

  const usage = await getSupabaseUsage();

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background px-5 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Usage</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Supabase capacity and Free-plan limits
            </p>
          </div>
        </div>

        <AppMenu initialCanViewUsage />
      </header>

      <UsageDashboard usage={usage} />
    </>
  );
}
