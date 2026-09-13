import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";

import { formatDateOnly } from "@/lib/date-format";
import { recurringStatusCopy, type RecurringTimelineStatus } from "@/lib/recurring";

export type HomeRecurringItem = {
  id: string;
  name: string;
  groupName: string;
  dueDate: string;
  amount: number;
  role: "pay" | "receive";
  status: RecurringTimelineStatus;
};

export function RecurringSummary({ items }: { items: HomeRecurringItem[] }) {
  if (!items.length) return null;

  return (
    <section className="px-5 pt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recurring</h2>
        <Link href="/recurring" className="flex items-center gap-1 text-xs font-semibold text-blue-400">View all <ChevronRight className="size-3.5" /></Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
        {items.map((item, index) => {
          const copy = recurringStatusCopy[item.status];
          return (
            <Link key={item.id} href={`/recurring/${item.id}`} className={`flex items-center gap-3 px-4 py-3.5 ${index < items.length - 1 ? "border-b border-white/[0.06]" : ""}`}>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400"><CalendarClock className="size-4" /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.groupName} · {formatDateOnly(item.dueDate)}</p></div>
              <div className="text-right"><p className="text-sm font-bold">RM {item.amount.toFixed(2)}</p><p className={`mt-0.5 text-[10px] font-semibold ${item.status === "due" ? "text-red-300" : item.status === "pending" ? "text-amber-300" : "text-muted-foreground"}`}>{item.role === "receive" ? "To receive" : copy.label}</p></div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

