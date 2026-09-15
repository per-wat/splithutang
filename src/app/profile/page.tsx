import Link from "next/link";
import { ArrowLeft, ChevronRight, ListChecks } from "lucide-react";
import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { NotificationSettings } from "@/components/profile/notification-settings";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();

  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      `
        display_name,
        avatar_color,
        avatar_path
      `,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    console.error("Unable to load profile:", error);

    throw new Error("Unable to load profile");
  }

  let avatarUrl: string | null = null;

  if (profile.avatar_path) {
    const { data } = supabase.storage
      .from("avatars")
      .getPublicUrl(profile.avatar_path);

    avatarUrl = data.publicUrl;
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-background px-5 pb-3 pt-6">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div>
          <h1 className="text-xl font-bold">Profile & Settings</h1>

          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage your SplitHutang account
          </p>
        </div>
      </header>

      <div className="px-5 pb-8 pt-4">
        <Link
          href="/getting-started"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-card p-4 transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400">
            <ListChecks className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Getting Started</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Home Screen installation and notification setup
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>

        <ProfileSettingsForm
          userId={user.id}
          email={user.email ?? ""}
          initialDisplayName={profile.display_name}
          initialAvatarColor={profile.avatar_color}
          initialAvatarPath={profile.avatar_path}
          initialAvatarUrl={avatarUrl}
        />

        <NotificationSettings userId={user.id} />
      </div>
    </>
  );
}
