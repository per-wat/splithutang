import { ExpenseCard } from "@/components/expenses/expense-card";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpensesHeader } from "@/components/expenses/expenses-header";
import { AppShell } from "@/components/layout/app-shell";

const expenses = [
  {
    id: 1,
    title: "Dinner at Seoul Garden",
    date: "22 Aug",
    paidBy: "You",
    amount: 180,
    status: "owed-to-me" as const,
    unpaidCount: 3,
  },
  {
    id: 2,
    title: "Pizza Night",
    date: "20 Aug",
    paidBy: "Ahmad",
    amount: 85,
    status: "i-owe" as const,
  },
  {
    id: 3,
    title: "Grab Ride",
    date: "19 Aug",
    paidBy: "You",
    amount: 30,
    status: "owed-to-me" as const,
    unpaidCount: 1,
  },
  {
    id: 4,
    title: "Lunch at Mid Valley",
    date: "18 Aug",
    paidBy: "Sarah",
    amount: 45,
    status: "settled" as const,
  },
];

export default function ExpensesPage() {
  return (
    <AppShell>
      <ExpensesHeader />

      <ExpenseFilters />

      <section className="space-y-3 px-5 pb-8 pt-5">
        {expenses.map((expense) => (
          <ExpenseCard
            key={expense.id}
            title={expense.title}
            date={expense.date}
            paidBy={expense.paidBy}
            amount={expense.amount}
            status={expense.status}
            unpaidCount={expense.unpaidCount}
          />
        ))}
      </section>
    </AppShell>
  );
}
