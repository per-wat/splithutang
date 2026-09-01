"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { IouFilters, type IouFilter } from "./iou-filters";

import { IouCard, type IouStatus } from "./iou-card";

export type IouOverview = {
  id: string;
  title: string;
  date: string;
  from: string;
  to: string;
  amount: number;
  originalAmount: number;
  status: IouStatus;
};

type IousListProps = {
  ious: IouOverview[];
};

function matchesFilter(iou: IouOverview, filter: IouFilter) {
  switch (filter) {
    case "Owed to Me":
      return iou.status === "owed-to-me";

    case "I Owe":
      return iou.status === "i-owe";

    case "Settled":
      return iou.status === "settled";

    case "All":
    default:
      return true;
  }
}

export function IousList({ ious }: IousListProps) {
  const [activeFilter, setActiveFilter] = useState<IouFilter>("All");

  const filteredIous = useMemo(
    () => ious.filter((iou) => matchesFilter(iou, activeFilter)),
    [ious, activeFilter],
  );

  return (
    <>
      <IouFilters
        activeFilter={activeFilter}
        onChange={setActiveFilter}
      />

      <section className="space-y-3 px-5 pb-8 pt-5">
        {filteredIous.length > 0 ? (
          filteredIous.map((iou) => (
            <Link
              key={iou.id}
              href={`/ious/${iou.id}`}
              className="block rounded-2xl transition-transform active:scale-[0.99]"
            >
              <IouCard
                title={iou.title}
                date={iou.date}
                from={iou.from}
                to={iou.to}
                amount={iou.amount}
                originalAmount={iou.originalAmount}
                status={iou.status}
              />
            </Link>
          ))
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
            <p className="font-medium">No IOUs found</p>

            <p className="mt-1 text-sm text-muted-foreground">
              No IOUs match this filter.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
