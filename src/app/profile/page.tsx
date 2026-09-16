import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { AppMenu } from "@/components/layout/app-menu";
import { AppBackButton } from "@/components/layout/app-back-button";
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
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background px-5 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppBackButton fallbackHref="/" label="Go back" />

          <div className="min-w-0">
            <h1 className="text-xl font-bold">Profile</h1>

            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Manage your personal details
            </p>
          </div>
        </div>

        <AppMenu
          initialProfile={{
            displayName: profile.display_name,
            avatarColor: profile.avatar_color,
            avatarUrl,
          }}
        />
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
    </>
  );
}
