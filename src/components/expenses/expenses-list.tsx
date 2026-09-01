"use client";

import Link from "next/link";

import { useMemo, useState } from "react";

import { ExpenseFilters, type ExpenseFilter } from "./expense-filters";

import { ExpenseCard, type ExpenseStatus } from "./expense-card";

export type ExpenseOverview = {
  id: string;
  title: string;
  date: string;
  paidBy: string;
  amount: number;
  status: ExpenseStatus;
  unpaidCount: number;
};

type ExpensesListProps = {
  expenses: ExpenseOverview[];
};

function matchesFilter(expense: ExpenseOverview, filter: ExpenseFilter) {
  switch (filter) {
    case "Owed to Me":
      return expense.status === "owed-to-me";

    case "I Owe":
      return expense.status === "i-owe";

    case "Settled":
      return expense.status === "settled";

    case "All":
    default:
      return true;
  }
}

export function ExpensesList({ expenses }: ExpensesListProps) {
  const [activeFilter, setActiveFilter] = useState<ExpenseFilter>("All");

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesFilter(expense, activeFilter)),
    [expenses, activeFilter],
  );

  return (
    <>
      <ExpenseFilters
        activeFilter={activeFilter}
        onChange={setActiveFilter}
      />

      <section className="space-y-3 px-5 pb-8 pt-5">
        {filteredExpenses.length > 0 ? (
          filteredExpenses.map((expense) => (
            <Link
              key={expense.id}
              href={`/expenses/${expense.id}`}
              className="block rounded-2xl transition-transform active:scale-[0.99]"
            >
              <ExpenseCard
                title={expense.title}
                date={expense.date}
                paidBy={expense.paidBy}
                amount={expense.amount}
                status={expense.status}
                unpaidCount={expense.unpaidCount}
              />
            </Link>
          ))
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
            <p className="font-medium">No expenses found</p>

            <p className="mt-1 text-sm text-muted-foreground">
              No expenses match this filter.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
