import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { AppMenu } from "@/components/layout/app-menu";

export function ExpensesHeader() {
  return (
    <header className="px-5 pt-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            Expenses
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Keep track of shared spending
          </p>
        </div>

        <AppMenu />
      </div>

      <Link href="/recurring" className="mt-5 flex items-center justify-between rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] px-4 py-3 text-sm font-semibold text-blue-300">
        <span className="flex items-center gap-2"><CalendarClock className="size-4" /> Recurring payments</span>
        <span className="text-xs font-medium text-blue-400">See monthly payments</span>
      </Link>
    </header>
  );
}
