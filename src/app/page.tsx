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
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/date-format";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
   * ------------------------------------------
   * Profile
   * ------------------------------------------
   */

  const { data: profile, error: profileError } = await supabase
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

  if (profileError) {
    console.error("Failed to load profile:", profileError);
  }

  const displayName =
    profile?.display_name ??
    user.user_metadata?.display_name ??
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

  const { data: peopleBalances, error: balanceError } = await supabase.rpc(
    "get_people_balances",
  );

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

  /*
   * ------------------------------------------
   * Recent expenses
   * ------------------------------------------
   */

  const { data: expenses, error: expenseError } = await supabase
    .from("expenses")
    .select("id, name, expense_date, total_amount, created_at")
    .order("created_at", {
      ascending: false,
    })
    .limit(10);

  if (expenseError) {
    console.error("Failed to load recent expenses:", expenseError);
    throw new Error("Unable to load recent expenses");
  }

  /*
   * ------------------------------------------
   * Recent IOUs
   * ------------------------------------------
   */

  const { data: ious, error: iouError } = await supabase
    .from("ious")
    .select("id, reason, iou_date, amount, created_at")
    .order("created_at", {
      ascending: false,
    })
    .limit(10);

  if (iouError) {
    console.error("Failed to load recent IOUs:", iouError);
    throw new Error("Unable to load recent IOUs");
  }

  /*
   * ------------------------------------------
   * Combine activity
   * ------------------------------------------
   */

  const expenseActivities: Activity[] = (expenses ?? []).map((expense) => ({
    id: expense.id,
    type: "expense",
    title: expense.name,
    date: formatDateOnly(expense.expense_date),
    amount: Number(expense.total_amount),
    createdAt: expense.created_at,
  }));

  const iouActivities: Activity[] = (ious ?? []).map((iou) => ({
    id: iou.id,
    type: "iou",
    title: iou.reason,
    date: formatDateOnly(iou.iou_date),
    amount: Number(iou.amount),
    createdAt: iou.created_at,
  }));

  const recentActivities = [...expenseActivities, ...iouActivities]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5);

  return (
    <AppShell>
      <HomeHeader
        displayName={displayName}
        avatarColor={avatarColor}
        avatarUrl={avatarUrl}
      />

      <BalanceSummary
        owedToYou={owedToYou}
        youOwe={youOwe}
      />

      <OutstandingList people={outstandingPeople} />

      <RecentActivity activities={recentActivities} />
    </AppShell>
  );
}
