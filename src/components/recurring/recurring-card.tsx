import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { formatDateOnly } from "@/lib/date-format";
import { recurringStatusCopy, type RecurringOverview } from "@/lib/recurring";

import { MonthTimeline } from "./month-timeline";

export function RecurringCard({ item, year }: { item: RecurringOverview; year: number }) {
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 1;
  const currentStatus = item.timeline.find((month) => month.month === currentMonth)?.status ?? "not_applicable";
  const statusCopy = recurringStatusCopy[currentStatus];
  const amountLabel = item.userReceives > 0
    ? `You will receive RM ${item.userReceives.toFixed(2)}`
    : item.userShare > 0
      ? `You need to pay RM ${item.userShare.toFixed(2)}`
      : `Monthly total RM ${item.totalAmount.toFixed(2)}`;

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-card p-4">
      <Link href={`/recurring/${item.id}`} className="block active:opacity-80">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
            <CalendarClock className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-bold">{item.name}</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.groupName} · Bill paid by {item.payerName}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusCopy.className}`}>
                {statusCopy.symbol} {statusCopy.label}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold">{amountLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every month{item.nextDueDate ? ` · Next payment ${formatDateOnly(item.nextDueDate)}` : ""}
            </p>
          </div>
        </div>
      </Link>

      <div className="mt-4">
        <MonthTimeline
          year={year}
          timeline={item.timeline}
          pathname={`/recurring/${item.id}`}
          compact
        />
      </div>
    </article>
  );
}
