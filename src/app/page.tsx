import { redirect } from "next/navigation";

import { BalanceSummary } from "@/components/home/balance-summary";
import { HomeHeader } from "@/components/home/home-header";
import {
  OutstandingList,
  type OutstandingPerson,
} from "@/components/home/outstanding-list";
import {
  RecentActivity,
  type Activity,
} from "@/components/home/recent-activity";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/date-format";
import { RecurringSummary, type HomeRecurringItem } from "@/components/home/recurring-summary";
import { recurringStatusCopy, type RecurringTimelineStatus } from "@/lib/recurring";
import { GettingStartedCard } from "@/components/onboarding/getting-started-card";
import { parseLearningProgress } from "@/lib/onboarding/learning";

export default async function Home() {
  const supabase = await createClient();

  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  /*
   * ------------------------------------------
   * Profile
   * ------------------------------------------
   */

  const [
    profileResult,
    balancesResult,
    activityResult,
    recurringResult,
    onboardingResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
        display_name,
        avatar_color,
        avatar_path
      `,
      )
      .eq("id", user.id)
      .maybeSingle(),

    supabase.rpc("get_people_balances"),

    supabase.rpc("get_recent_activity_with_group", {
      p_limit: 5,
    }),

    supabase.rpc("get_recurring_home_summary", { p_limit: 3 }),

    supabase.rpc("get_onboarding_progress"),
  ]);

  const { data: profile, error: profileError } = profileResult;

  if (profileError) {
    console.error("Failed to load profile:", profileError);
  }

  const displayName =
    profile?.display_name ??
    user.displayName ??
    user.email?.split("@")[0] ??
    "You";

  const avatarColor = profile?.avatar_color ?? "bg-blue-600";

  let avatarUrl: string | null = null;

  if (profile?.avatar_path) {
    const { data } = supabase.storage
      .from("avatars")
      .getPublicUrl(profile.avatar_path);

    avatarUrl = data.publicUrl;
  }

  /*
   * ------------------------------------------
   * Balances
   * ------------------------------------------
   */

  const { data: peopleBalances, error: balanceError } = balancesResult;

  if (balanceError) {
    console.error("Failed to load dashboard balances:", balanceError);

    throw new Error("Unable to load dashboard balances");
  }

  const balancePersonIds = (peopleBalances ?? []).map(
    (person) => person.person_id,
  );

  const { data: balanceAvatars, error: balanceAvatarError } =
    balancePersonIds.length > 0
      ? await supabase
          .from("people")
          .select(
            `
            id,
            avatar_color,
            avatar_path
          `,
          )
          .in("id", balancePersonIds)
      : {
          data: [],
          error: null,
        };

  if (balanceAvatarError) {
    console.error("Failed to load dashboard avatars:", balanceAvatarError);
  }

  const balanceAvatarMap = new Map(
    (balanceAvatars ?? []).map((person) => [person.id, person]),
  );

  const balances = (peopleBalances ?? []).map((person) => {
    const avatar = balanceAvatarMap.get(person.person_id);

    return {
      id: person.person_id,

      name: person.name,

      balance: Number(person.balance ?? 0),

      avatarColor: avatar?.avatar_color ?? "bg-blue-600",

      avatarPath: avatar?.avatar_path ?? null,
    };
  });

  const owedToYou = balances
    .filter((person) => person.balance > 0)
    .reduce((total, person) => total + person.balance, 0);

  const youOwe = balances
    .filter((person) => person.balance < 0)
    .reduce((total, person) => total + Math.abs(person.balance), 0);

  const outstandingPeople: OutstandingPerson[] = balances
    .filter((person) => person.balance > 0)
    .map((person) => ({
      id: person.id,

      name: person.name,

      amount: person.balance,

      avatarColor: person.avatarColor,

      avatarPath: person.avatarPath,
    }))
    .sort((a, b) => b.amount - a.amount);

  const { data: activityRows, error: activityError } = activityResult;

  if (activityError) {
    console.error("Failed to load recent activity:", activityError);
    throw new Error("Unable to load recent activity");
  }

  const recentActivities: Activity[] = (activityRows ?? []).map((activity) => ({
    id: activity.activity_id,
    type: activity.activity_type === "iou" ? "iou" : "expense",
    title: activity.title,
    date: formatDateOnly(activity.activity_date),
    groupName: activity.group_name,
    amount: Number(activity.amount),
    createdAt: activity.created_at,
  }));

  if (recurringResult.error) {
    console.error("Failed to load recurring summary:", recurringResult.error);
  }

  const recurringItems: HomeRecurringItem[] = Array.isArray(recurringResult.data)
    ? recurringResult.data.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") return [];
        const status = typeof value.status === "string" && value.status in recurringStatusCopy
          ? value.status as RecurringTimelineStatus
          : "upcoming";
        return [{
          id: value.id,
          name: typeof value.name === "string" ? value.name : "Recurring payment",
          groupName: typeof value.group_name === "string" ? value.group_name : "Group",
          dueDate: typeof value.due_date === "string" ? value.due_date : new Date().toISOString().slice(0, 10),
          amount: typeof value.amount === "number" ? value.amount : Number(value.amount) || 0,
          role: value.role === "receive" ? "receive" as const : "pay" as const,
          status,
        }];
      })
    : [];

  if (onboardingResult.error) {
    console.error("Failed to load onboarding progress:", onboardingResult.error);
  }

  const learningProgress = parseLearningProgress(onboardingResult.data?.[0]);

  return (
    <>
      <HomeHeader
        displayName={displayName}
        avatarColor={avatarColor}
        avatarUrl={avatarUrl}
      />

      <GettingStartedCard learningProgress={learningProgress} />

      <BalanceSummary
        owedToYou={owedToYou}
        youOwe={youOwe}
      />

      <OutstandingList people={outstandingPeople} />

      <RecurringSummary items={recurringItems} />

      <RecentActivity activities={recentActivities} />
    </>
  );
}
