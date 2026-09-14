import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  monthLabels,
  recurringStatusCopy,
  type RecurringTimelineMonth,
} from "@/lib/recurring";

type MonthTimelineProps = {
  year: number;
  timeline: RecurringTimelineMonth[];
  pathname: string;
  selectedMonth?: number;
  compact?: boolean;
};

export function MonthTimeline({
  year,
  timeline,
  pathname,
  selectedMonth,
  compact = false,
}: MonthTimelineProps) {
  const byMonth = new Map(timeline.map((month) => [month.month, month]));

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex items-center justify-center gap-4">
          <Link
            href={`${pathname}?year=${year - 1}`}
            aria-label={`View ${year - 1}`}
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <p className="min-w-14 text-center font-bold">{year}</p>
          <Link
            href={`${pathname}?year=${year + 1}`}
            aria-label={`View ${year + 1}`}
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-6 gap-1.5" aria-label={`Payment status for ${year}`}>
        {monthLabels.map((label, index) => {
          const monthNumber = index + 1;
          const month = byMonth.get(monthNumber) ?? {
            month: monthNumber,
            periodId: null,
            dueDate: null,
            status: "not_applicable" as const,
          };
          const copy = recurringStatusCopy[month.status];
          const content = (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {label}
              </span>
              <span className="mt-1 text-sm font-bold" aria-hidden="true">
                {copy.symbol}
              </span>
              <span className="sr-only">{copy.label}</span>
            </>
          );
          const className = `flex min-h-12 flex-col items-center justify-center rounded-xl border px-1 py-1.5 ${copy.className} ${
            selectedMonth === monthNumber ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background" : ""
          }`;

          return compact ? (
            <div key={label} className={className} title={`${label}: ${copy.label}`}>
              {content}
            </div>
          ) : (
            <Link
              key={label}
              href={`${pathname}?year=${year}&month=${monthNumber}`}
              className={className}
              title={`${label}: ${copy.label}`}
              aria-label={`${label} ${year}: ${copy.label}`}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

