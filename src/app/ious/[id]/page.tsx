import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { IouPaymentAction } from "@/components/ious/iou-payment-action";
import { createClient } from "@/lib/supabase/server";
import { getPersonDisplayName } from "@/lib/person-display-name";

type IouDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatMoney(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatPaymentDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export default async function IouDetailPage({ params }: IouDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
   * IOU
   */
  const { data: iou, error: iouError } = await supabase
    .from("ious")
    .select(
      `
        id,
        owner_id,
        group_id,
        from_person_id,
        to_person_id,
        amount,
        reason,
        iou_date
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (iouError || !iou) {
    notFound();
  }

  /*
   * Related information.
   */
  const [groupResult, peopleResult, paymentsResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, owner_id")
      .eq("id", iou.group_id)
      .maybeSingle(),

    supabase
      .from("people")
      .select("id, name, avatar_color, linked_user_id")
      .in("id", [iou.from_person_id, iou.to_person_id]),

    supabase
      .from("iou_payments")
      .select(
        `
          id,
          from_person_id,
          to_person_id,
          amount,
          paid_at,
          note
        `,
      )
      .eq("iou_id", iou.id)
      .order("paid_at", {
        ascending: false,
      }),
  ]);

  if (groupResult.error || peopleResult.error || paymentsResult.error) {
    console.error("Unable to load IOU details:", {
      group: groupResult.error,
      people: peopleResult.error,
      payments: paymentsResult.error,
    });
  }

  const group = groupResult.data;

  const people = peopleResult.data ?? [];

  const payments = paymentsResult.data ?? [];

  const debtor = people.find((person) => person.id === iou.from_person_id);

  const creditor = people.find((person) => person.id === iou.to_person_id);

  if (!debtor || !creditor) {
    notFound();
  }

  const debtorName = getPersonDisplayName(debtor, user.id);

  const creditorName = getPersonDisplayName(creditor, user.id);

  /*
   * Calculate outstanding amount.
   */
  const paidAmount = payments
    .filter(
      (payment) =>
        payment.from_person_id === iou.from_person_id &&
        payment.to_person_id === iou.to_person_id,
    )
    .reduce((total, payment) => total + Number(payment.amount), 0);

  const originalAmount = Number(iou.amount);

  const remaining = Math.max(originalAmount - paidAmount, 0);

  const settled = remaining <= 0;

  const hasPartialPayment = paidAmount > 0 && !settled;

  /*
   * Determine current user's role.
   */
  const selfPerson = people.find((person) => person.linked_user_id === user.id);

  const isGroupOwner = group?.owner_id === user.id;

  const canRecordPayment =
    !settled &&
    (isGroupOwner ||
      selfPerson?.id === debtor.id ||
      selfPerson?.id === creditor.id);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        {/* Header */}
        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <Link
            href="/ious"
            aria-label="Back to IOUs"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <h1 className="text-xl font-bold">IOU Details</h1>
        </header>

        {/* Main summary */}
        <section className="mt-3 rounded-2xl border border-white/[0.08] bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10">
              <FileText className="size-5 text-purple-400" />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{iou.reason}</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(iou.iou_date)}
              </p>

              {group && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {group.name}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Remaining
            </p>

            <p
              className={`mt-1 text-3xl font-bold tracking-tight ${
                settled ? "text-emerald-400" : ""
              }`}
            >
              {formatMoney(remaining)}
            </p>

            {paidAmount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Original amount: {formatMoney(originalAmount)}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="font-semibold">{debtorName}</span>

              <ArrowRight className="size-4 text-muted-foreground" />

              <span className="font-semibold">{creditorName}</span>
            </div>

            <p
              className={`mt-2 text-xs font-medium ${
                settled
                  ? "text-emerald-400"
                  : hasPartialPayment
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            >
              {settled
                ? "Settled"
                : hasPartialPayment
                  ? "Partially paid"
                  : "Unpaid"}
            </p>
          </div>
        </section>

        {/* Balance breakdown */}
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Payment Summary
          </h2>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-muted-foreground">
                Original amount
              </span>

              <span className="text-sm font-semibold">
                {formatMoney(originalAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5">
              <span className="text-sm text-muted-foreground">Paid</span>

              <span className="text-sm font-semibold text-emerald-400">
                {formatMoney(paidAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5">
              <span className="text-sm font-medium">Remaining</span>

              <span className="font-bold">{formatMoney(remaining)}</span>
            </div>
          </div>
        </section>

        {/* Payment action */}
        {canRecordPayment && (
          <div className="mt-5">
            <IouPaymentAction
              iouId={iou.id}
              debtorName={debtorName}
              creditorName={creditorName}
              remaining={remaining}
            />
          </div>
        )}

        {/* Payment history */}
        {payments.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Payment History
            </h2>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {payments.map((payment, index) => (
                <div
                  key={payment.id}
                  className={`px-4 py-4 ${
                    index !== payments.length - 1
                      ? "border-b border-white/[0.06]"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {debtorName} → {creditorName}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPaymentDate(payment.paid_at)}
                      </p>

                      {payment.note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {payment.note}
                        </p>
                      )}
                    </div>

                    <p className="shrink-0 font-semibold text-emerald-400">
                      {formatMoney(Number(payment.amount))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
