import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <AppShell>
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
        <ProfileSettingsForm
          userId={user.id}
          email={user.email ?? ""}
          initialDisplayName={profile.display_name}
          initialAvatarColor={profile.avatar_color}
          initialAvatarPath={profile.avatar_path}
          initialAvatarUrl={avatarUrl}
        />
      </div>
    </AppShell>
  );
}
