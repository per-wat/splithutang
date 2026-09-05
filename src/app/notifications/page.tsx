import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { NotificationCentre } from "@/components/notifications/notification-centre";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.05] bg-background/95 px-5 pb-3 pt-6 backdrop-blur-md">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Your SplitHutang activity</p>
        </div>
      </header>

      <NotificationCentre />
    </AppShell>
  );
}
