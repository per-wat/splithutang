import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppInstallationSettings } from "@/components/settings/app-installation-settings";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { AppMenu } from "@/components/layout/app-menu";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background px-5 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <div className="min-w-0">
            <h1 className="text-xl font-bold">Settings</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Manage this device and your alerts
            </p>
          </div>
        </div>

        <AppMenu />
      </header>

      <div className="px-5 pb-8 pt-4">
        <AppInstallationSettings />
        <NotificationSettings userId={user.id} />
      </div>
    </>
  );
}
