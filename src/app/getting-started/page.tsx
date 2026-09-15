import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GettingStartedExperience } from "@/components/onboarding/getting-started-experience";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function GettingStartedPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: preference, error } = await supabase
    .from("notification_preferences")
    .select("push_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load notification preference:", error);
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-background px-5 pb-3 pt-6">
        <Link
          href="/profile"
          aria-label="Back to profile and settings"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div>
          <h1 className="text-xl font-bold">Getting Started</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set up this device for SplitHutang
          </p>
        </div>
      </header>

      <GettingStartedExperience
        userId={user.id}
        initialPushMode={preference?.push_mode ?? null}
      />
    </>
  );
}
