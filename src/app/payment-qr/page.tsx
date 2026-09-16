import { redirect } from "next/navigation";

import { AppBackButton } from "@/components/layout/app-back-button";
import { AppMenu } from "@/components/layout/app-menu";
import { PaymentQrSettings } from "@/components/settings/payment-qr-settings";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PaymentQrPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, payment_qr_path")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    console.error("Unable to load payment QR settings:", error);
    throw new Error("Unable to load payment QR settings");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background px-5 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Payment QR</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Make it easier for friends to pay you
            </p>
          </div>
        </div>

        <AppMenu />
      </header>

      <div className="px-5 pb-8 pt-4">
        <PaymentQrSettings
          userId={user.id}
          displayName={profile.display_name}
          initialPaymentQrPath={profile.payment_qr_path}
        />
      </div>
    </>
  );
}
