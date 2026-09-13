import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { RecurringCard } from "@/components/recurring/recurring-card";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseRecurringTimeline, type RecurringOverview } from "@/lib/recurring";

type RecurringPageProps = {
  searchParams: Promise<{ year?: string }>;
};

export default async function RecurringPage({ searchParams }: RecurringPageProps) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  const query = await searchParams;
  const requestedYear = Number(query.year);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
    ? requestedYear
    : new Date().getFullYear();

  const { data, error } = await supabase.rpc("get_recurring_overview", { p_year: year });
  if (error) {
    console.error("Failed to load recurring payments:", error);
    throw new Error("Unable to load recurring payments");
  }

  const items: RecurringOverview[] = (data ?? []).map((row) => ({
    id: row.recurring_id,
    name: row.name,
    groupName: row.group_name,
    payerName: row.payer_name,
    payerPersonId: row.payer_person_id,
    frequency: row.frequency,
    arrangementStatus: row.arrangement_status === "paused" || row.arrangement_status === "ended"
      ? row.arrangement_status
      : "active",
    startDate: row.start_date,
    endDate: row.end_date,
    totalAmount: Number(row.total_amount),
    userShare: Number(row.user_share),
    userReceives: Number(row.user_receives),
    nextDueDate: row.next_due_date,
    timeline: parseRecurringTimeline(row.timeline),
  }));

  return (
    <>
      <header className="px-5 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight">Recurring</h1>
            <p className="mt-1 text-sm text-muted-foreground">Monthly payments without the guesswork</p>
          </div>
          <Link
            href="/recurring/new"
            className="flex size-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            aria-label="Add recurring payment"
          >
            <Plus className="size-5" />
          </Link>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-card px-3 py-2">
          <Link href={`/recurring?year=${year - 1}`} aria-label={`View ${year - 1}`} className="flex size-9 items-center justify-center rounded-full text-muted-foreground">
            <ChevronLeft className="size-4" />
          </Link>
          <p className="font-bold">{year}</p>
          <Link href={`/recurring?year=${year + 1}`} aria-label={`View ${year + 1}`} className="flex size-9 items-center justify-center rounded-full text-muted-foreground">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </header>

      <section className="space-y-3 px-5 pb-8 pt-5">
        {items.length > 0 ? items.map((item) => (
          <RecurringCard key={item.id} item={item} year={year} />
        )) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-5 py-10 text-center">
            <CalendarPlus className="mx-auto size-8 text-blue-400" />
            <p className="mt-3 font-semibold">No recurring payments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add Netflix, rent, internet, or any shared monthly payment.</p>
            <Link href="/recurring/new" className="mt-5 inline-flex h-11 items-center rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white">
              Add recurring payment
            </Link>
          </div>
        )}
      </section>
    </>
  );
}

