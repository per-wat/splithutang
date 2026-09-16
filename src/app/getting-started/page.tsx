import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GettingStartedExperience } from "@/components/onboarding/getting-started-experience";
import { RestartGettingStarted } from "@/components/onboarding/restart-getting-started";
import { AppMenu } from "@/components/layout/app-menu";
import { parseLearningProgress } from "@/lib/onboarding/learning";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function GettingStartedPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const [preferenceResult, learningResult] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("push_mode")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_onboarding_progress"),
  ]);

  const { data: preference, error } = preferenceResult;

  if (error) {
    console.error("Unable to load notification preference:", error);
  }

  if (learningResult.error) {
    console.error("Unable to load onboarding progress:", learningResult.error);
  }

  const learningProgress = parseLearningProgress(learningResult.data?.[0]);

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
            <h1 className="text-xl font-bold">Getting Started</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Set up this device and learn the basics
            </p>
          </div>
        </div>

        <AppMenu />
      </header>

      <GettingStartedExperience
        userId={user.id}
        initialPushMode={preference?.push_mode ?? null}
        learningProgress={learningProgress}
      />

      <div className="px-5 pb-8">
        <RestartGettingStarted userId={user.id} />
      </div>
    </>
  );
}
