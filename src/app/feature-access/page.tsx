import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FeatureAccessManager } from "@/components/features/feature-access-manager";
import { AppBackButton } from "@/components/layout/app-back-button";
import { AppMenu } from "@/components/layout/app-menu";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAppOwner } from "@/lib/usage/access";

export const metadata: Metadata = { title: "Feature Access" };
export const dynamic = "force-dynamic";

export default async function FeatureAccessPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");
  if (!isAppOwner(user.id)) notFound();

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/[0.05] bg-background/95 px-5 pb-3 pt-6 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Feature Access</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose who can use restricted features</p>
          </div>
        </div>
        <AppMenu initialCanViewUsage />
      </header>
      <FeatureAccessManager />
    </>
  );
}
