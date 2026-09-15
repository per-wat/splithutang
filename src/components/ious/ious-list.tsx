"use client";

import Link from "next/link";
import { HandCoins } from "lucide-react";
import { useMemo, useState } from "react";

import { IouFilters, type IouFilter } from "./iou-filters";

import { IouCard, type IouStatus } from "./iou-card";

export type IouOverview = {
  id: string;
  title: string;
  date: string;
  groupName: string;
  from: string;
  to: string;
  amount: number;
  originalAmount: number;
  status: IouStatus;
};

type IousListProps = {
  ious: IouOverview[];
};

const PAGE_SIZE = 30;

function matchesFilter(iou: IouOverview, filter: IouFilter) {
  switch (filter) {
    case "To Receive":
      return iou.status === "owed-to-me";

    case "To Pay":
      return iou.status === "i-owe";

    case "Fully Paid":
      return iou.status === "settled";

    case "All":
    default:
      return true;
  }
}

export function IousList({ ious }: IousListProps) {
  const [activeFilter, setActiveFilter] = useState<IouFilter>("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredIous = useMemo(
    () => ious.filter((iou) => matchesFilter(iou, activeFilter)),
    [ious, activeFilter],
  );

  const visibleIous = filteredIous.slice(0, visibleCount);
  const remainingCount = Math.max(filteredIous.length - visibleIous.length, 0);

  function handleFilterChange(filter: IouFilter) {
    setActiveFilter(filter);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <>
      <IouFilters
        activeFilter={activeFilter}
        onChange={handleFilterChange}
      />

      <section className="space-y-3 px-5 pb-8 pt-5">
        {filteredIous.length > 0 ? (
          <>
            {visibleIous.map((iou) => (
              <Link
                key={iou.id}
                href={`/ious/${iou.id}`}
                className="block rounded-2xl transition-transform active:scale-[0.99]"
              >
                <IouCard
                  title={iou.title}
                  date={iou.date}
                  groupName={iou.groupName}
                  from={iou.from}
                  to={iou.to}
                  amount={iou.amount}
                  originalAmount={iou.originalAmount}
                  status={iou.status}
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
        ) : ious.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-600/10">
              <HandCoins className="size-5 text-blue-400" />
            </div>

            <p className="mt-4 font-semibold">No Hutang yet</p>

            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Use Hutang when one person needs to pay another, without splitting
              a shared expense.
            </p>

            <Link
              href="/add-iou"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
            >
              Add Hutang
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
            <p className="font-medium">No Hutang found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No Hutang matches this filter.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
