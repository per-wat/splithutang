import { redirect } from "next/navigation";

import { NotificationCentre } from "@/components/notifications/notification-centre";
import { AppMenu } from "@/components/layout/app-menu";
import { AppBackButton } from "@/components/layout/app-back-button";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/[0.05] bg-background/95 px-5 pb-3 pt-6 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />

          <div className="min-w-0">
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Your SplitHutang activity</p>
          </div>
        </div>

        <AppMenu />
      </header>

      <NotificationCentre />
    </>
  );
}
