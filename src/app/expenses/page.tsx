import { redirect } from "next/navigation";

import { ExpensesHeader } from "@/components/expenses/expenses-header";

import {
  ExpensesList,
  type ExpenseOverview,
} from "@/components/expenses/expenses-list";

import type { ExpenseStatus } from "@/components/expenses/expense-card";

import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function getExpenseStatus(status: string): ExpenseStatus {
  switch (status) {
    case "owed-to-me":
    case "i-owe":
    case "settled":
    case "group":
      return status;

    default:
      return "group";
  }
}

export default async function ExpensesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("get_expenses_overview");

  if (error) {
    console.error("Failed to load expenses:", error);

    return (
      <AppShell>
        <ExpensesHeader />

        <div className="px-5 pt-8">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-medium text-red-400">Unable to load expenses</p>

            <p className="mt-1 text-sm text-muted-foreground">
              Please try again later.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const expenses: ExpenseOverview[] = (data ?? []).map((expense) => ({
    id: expense.expense_id,
    title: expense.name,
    date: formatDate(expense.expense_date),
    paidBy: expense.paid_by_name,
    amount: Number(expense.total_amount),
    status: getExpenseStatus(expense.status),
    unpaidCount: Number(expense.unpaid_count ?? 0),
  }));

  return (
    <AppShell>
      <ExpensesHeader />

      <ExpensesList expenses={expenses} />
    </AppShell>
  );
}
