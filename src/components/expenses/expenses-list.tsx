"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

import { useMemo, useState } from "react";

import { ExpenseFilters, type ExpenseFilter } from "./expense-filters";

import { ExpenseCard, type ExpenseStatus } from "./expense-card";

export type ExpenseOverview = {
  id: string;
  title: string;
  date: string;
  groupName: string;
  paidBy: string;
  amount: number;
  status: ExpenseStatus;
  unpaidCount: number;
};

type ExpensesListProps = {
  expenses: ExpenseOverview[];
};

const PAGE_SIZE = 30;

function matchesFilter(expense: ExpenseOverview, filter: ExpenseFilter) {
  switch (filter) {
    case "To Receive":
      return expense.status === "owed-to-me";

    case "To Pay":
      return expense.status === "i-owe";

    case "Fully Paid":
      return expense.status === "settled";

    case "All":
    default:
      return true;
  }
}

export function ExpensesList({ expenses }: ExpensesListProps) {
  const [activeFilter, setActiveFilter] = useState<ExpenseFilter>("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesFilter(expense, activeFilter)),
    [expenses, activeFilter],
  );

  const visibleExpenses = filteredExpenses.slice(0, visibleCount);
  const remainingCount = Math.max(
    filteredExpenses.length - visibleExpenses.length,
    0,
  );

  function handleFilterChange(filter: ExpenseFilter) {
    setActiveFilter(filter);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <>
      <ExpenseFilters
        activeFilter={activeFilter}
        onChange={handleFilterChange}
      />

      <section className="space-y-3 px-5 pb-8 pt-5">
        {filteredExpenses.length > 0 ? (
          <>
            {visibleExpenses.map((expense) => (
              <Link
                key={expense.id}
                href={`/expenses/${expense.id}`}
                className="block rounded-2xl transition-transform active:scale-[0.99]"
              >
                <ExpenseCard
                  title={expense.title}
                  date={expense.date}
                  groupName={expense.groupName}
                  paidBy={expense.paidBy}
                  amount={expense.amount}
                  status={expense.status}
                  unpaidCount={expense.unpaidCount}
                />
              </Link>
            ))}

            {remainingCount > 0 && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="w-full rounded-2xl border border-white/[0.08] bg-card px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground active:bg-white/[0.06]"
              >
                Load more ({remainingCount} remaining)
              </button>
            )}
          </>
        ) : expenses.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-600/10">
              <Receipt className="size-5 text-blue-400" />
            </div>

            <p className="mt-4 font-semibold">No shared expenses yet</p>

            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Paid for something for your friends? Add it here and SplitHutang
              will calculate who needs to pay you back.
            </p>

            <Link
              href="/add-expense"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
            >
              Add expense
            </Link>
          </div>
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
