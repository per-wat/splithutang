import Link from "next/link";
import { ArrowLeft, CalendarClock, Pencil } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { PaymentReviewActions } from "@/components/payments/payment-review-actions";
import { MonthTimeline } from "@/components/recurring/month-timeline";
import { RecurringObligationAction } from "@/components/recurring/recurring-obligation-action";
import { SkipPeriodAction } from "@/components/recurring/skip-period-action";
import { formatDateOnly } from "@/lib/date-format";
import { monthLabels, parseRecurringDetail, recurringStatusCopy } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function RecurringDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestedYear = Number(query.year);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
    ? requestedYear
    : new Date().getFullYear();
  const requestedMonth = Number(query.month);
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : new Date().getFullYear() === year ? new Date().getMonth() + 1 : 1;

  const { data, error } = await supabase.rpc("get_recurring_detail", {
    p_arrangement_id: id,
    p_year: year,
  });
  if (error) {
    console.error("Unable to load recurring payment:", error);
    throw new Error("Unable to load recurring payment");
  }
  const detail = parseRecurringDetail(data);
  if (!detail) notFound();

  const timeline = Array.from({ length: 12 }, (_, index) => {
    const period = detail.periods.find((item) => new Date(`${item.periodStart}T00:00:00Z`).getUTCMonth() === index);
    return {
      month: index + 1,
      periodId: period?.id ?? null,
      dueDate: period?.dueDate ?? null,
      status: period?.viewerStatus ?? "not_applicable" as const,
    };
  });
  const selectedPeriod = detail.periods.find((period) => {
    const date = new Date(`${period.periodStart}T00:00:00Z`);
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
  });
  const viewerParticipant = detail.currentVersion.participants.find((person) => person.name === "You");
  const visibleObligations = detail.isPayer
    ? selectedPeriod?.obligations ?? []
    : (selectedPeriod?.obligations ?? []).filter((obligation) => obligation.personId === viewerParticipant?.personId);
  const selectedCopy = recurringStatusCopy[selectedPeriod?.viewerStatus ?? "not_applicable"];

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <Link href="/recurring" aria-label="Back to recurring" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"><ArrowLeft className="size-5" /></Link>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">Recurring Details</h1>
          {detail.canEdit && <Link href={`/recurring/${detail.id}/edit`} aria-label="Edit recurring payment" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"><Pencil className="size-4" /></Link>}
        </header>

        <section className="mt-3 rounded-2xl border border-white/[0.08] bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400"><CalendarClock className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold">{detail.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">{detail.groupName}</p></div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold capitalize text-muted-foreground">{detail.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Info label="Monthly total" value={`RM ${detail.currentVersion.totalAmount.toFixed(2)}`} />
                <Info label="Paid by" value={detail.payerName} />
                <Info label="Due" value={`Day ${detail.currentVersion.dueDay}`} />
                <Info label="Frequency" value="Monthly" />
                <Info label="Started" value={formatDateOnly(detail.startDate)} />
                <Info label="Ends" value={detail.endDate ? formatDateOnly(detail.endDate) : "No end date"} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-card p-4">
          <MonthTimeline year={year} timeline={timeline} pathname={`/recurring/${detail.id}`} selectedMonth={month} />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            {(["paid", "paid_advance", "pending", "due", "upcoming", "not_applicable", "skipped"] as const).map((status) => (
              <span key={status} className="text-[10px] text-muted-foreground"><span aria-hidden="true" className="font-bold">{recurringStatusCopy[status].symbol}</span> {recurringStatusCopy[status].label}</span>
            ))}
          </div>
        </section>

        <section className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="font-bold">{monthLabels[month - 1]} {year}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selectedPeriod ? `Due ${formatDateOnly(selectedPeriod.dueDate)}` : "Not active for this month"}</p></div>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${selectedCopy.className}`}>{selectedCopy.symbol} {selectedCopy.label}</span>
          </div>

          {selectedPeriod ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div><p className="text-sm font-medium">{detail.payerName}</p><p className="text-xs text-muted-foreground">Owner / payer · RM {Math.max(selectedPeriod.totalAmount - selectedPeriod.obligations.reduce((sum, obligation) => sum + obligation.shareAmount, 0), 0).toFixed(2)}</p></div>
                <span className="text-xs font-semibold text-blue-300">Payer</span>
              </div>
              {visibleObligations.map((obligation) => {
                const status = obligation.paymentStatus === "paid"
                  ? obligation.paidAt && new Date(obligation.paidAt) < new Date(`${selectedPeriod.dueDate}T00:00:00Z`)
                    ? "paid_advance"
                    : "paid"
                  : obligation.paymentStatus === "pending"
                    ? "pending"
                    : obligation.paymentStatus === "skipped"
                      ? "skipped"
                      : new Date(`${selectedPeriod.dueDate}T23:59:59Z`) < new Date()
                        ? "due"
                        : "upcoming";
                const copy = recurringStatusCopy[status];
                const requiresConfirmation = !detail.isPayer && !detail.allowDebtorSelfConfirm;
                return (
                  <div key={obligation.id} className="border-b border-white/[0.06] px-4 py-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{obligation.name}</p><p className="mt-0.5 text-xs text-muted-foreground">RM {obligation.shareAmount.toFixed(2)}</p></div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${copy.className}`}>{copy.symbol} {copy.label}</span>
                    </div>
                    <div className="mt-2 flex justify-end">
                      {obligation.paymentStatus === "unpaid" && (
                        <RecurringObligationAction arrangementId={detail.id} personId={obligation.personId} personName={obligation.name} payerName={detail.payerName} periods={detail.periods} requiresConfirmation={requiresConfirmation} mode={detail.isPayer ? "record-received" : "mark-paid"} />
                      )}
                    </div>
                    {detail.isPayer && obligation.paymentRecordStatus === "pending" && obligation.paymentId && <PaymentReviewActions kind="recurring" paymentId={obligation.paymentId} />}
                  </div>
                );
              })}
              {!detail.isPayer && visibleObligations.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">You do not have a share for this month.</p>}
            </div>
          ) : <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-8 text-center text-sm text-muted-foreground">This recurring payment was not active yet, or had already ended.</div>}
          {selectedPeriod && (detail.isPayer || detail.canEdit) && <div className="mt-3 text-right"><SkipPeriodAction periodId={selectedPeriod.id} skipped={selectedPeriod.state === "skipped"} /></div>}
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>;
}
