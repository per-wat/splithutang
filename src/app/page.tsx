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

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

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
   * Balances
   * ------------------------------------------
   */

  const { data: peopleBalances, error: balanceError } = await supabase.rpc(
    "get_people_balances",
  );

  if (balanceError) {
    console.error("Failed to load dashboard balances:", balanceError);
  }

  const balances = (peopleBalances ?? []).map((person) => ({
    id: person.person_id,
    name: person.name,
    balance: Number(person.balance ?? 0),
  }));

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
    date: formatDate(expense.expense_date),
    amount: Number(expense.total_amount),
    createdAt: expense.created_at,
  }));

  const iouActivities: Activity[] = (ious ?? []).map((iou) => ({
    id: iou.id,
    type: "iou",
    title: iou.reason,
    date: formatDate(iou.iou_date),
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
      <HomeHeader />

      <BalanceSummary
        owedToYou={owedToYou}
        youOwe={youOwe}
      />

      <OutstandingList people={outstandingPeople} />

      <RecentActivity activities={recentActivities} />
    </AppShell>
  );
}
