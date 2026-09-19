import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AnnouncementManager } from "@/components/announcements/announcement-manager";
import { AppBackButton } from "@/components/layout/app-back-button";
import { AppMenu } from "@/components/layout/app-menu";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isAppOwner } from "@/lib/usage/access";

export const metadata: Metadata = {
  title: "Announcements",
};

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  if (!isAppOwner(user.id)) {
    notFound();
  }

  const admin = createAdminClient();
  const [announcementsResult, usersResult] = await Promise.all([
    admin
      .from("announcements")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(50),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  if (announcementsResult.error) {
    console.error("Unable to load announcements:", announcementsResult.error);
    throw new Error("Unable to load announcements");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/[0.05] bg-background/95 px-5 pb-3 pt-6 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Announcements</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Publish updates to every SplitHutang user
            </p>
          </div>
        </div>

        <AppMenu initialCanViewUsage />
      </header>

      <AnnouncementManager
        initialAnnouncements={announcementsResult.data ?? []}
        currentUserCount={usersResult.count ?? 0}
      />
    </>
  );
}
