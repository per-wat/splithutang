import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { IouPaymentAction } from "@/components/ious/iou-payment-action";
import { PaymentReviewActions } from "@/components/payments/payment-review-actions";
import { getPersonDisplayName } from "@/lib/person-display-name";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly, formatTimestampDateMY } from "@/lib/date-format";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type IouDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatMoney(amount: number) {
  return `RM ${amount.toFixed(2)}`;
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
   * ------------------------------------------
   * IOU
   * ------------------------------------------
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
   * ------------------------------------------
   * Related information
   * ------------------------------------------
   */

  const [groupResult, peopleResult, paymentsResult] = await Promise.all([
    supabase
      .from("groups")
      .select(
        `
          id,
          name,
          owner_id,
          allow_debtor_self_confirm
        `,
      )
      .eq("id", iou.group_id)
      .maybeSingle(),

    supabase
      .from("people")
      .select("id, name, avatar_color, avatar_path, linked_user_id")
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
          note,
          status,
          submitted_by_user_id,
          resolved_by_user_id,
          resolved_at
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

    throw new Error("Unable to load IOU details");
  }

  const group = groupResult.data;

  const people = peopleResult.data ?? [];

  const payments = paymentsResult.data ?? [];

  /*
   * ------------------------------------------
   * Debtor / creditor
   * ------------------------------------------
   */

  const debtor = people.find((person) => person.id === iou.from_person_id);

  const creditor = people.find((person) => person.id === iou.to_person_id);

  if (!debtor || !creditor) {
    notFound();
  }

  const debtorName = getPersonDisplayName(debtor, user.id);

  const creditorName = getPersonDisplayName(creditor, user.id);

  /*
   * ------------------------------------------
   * Payment calculations
   * ------------------------------------------
   *
   * Only CONFIRMED payments reduce the debt.
   */

  const paidAmount = payments
    .filter(
      (payment) =>
        payment.from_person_id === iou.from_person_id &&
        payment.to_person_id === iou.to_person_id &&
        payment.status === "confirmed",
    )
    .reduce((total, payment) => total + Number(payment.amount), 0);

  /*
   * Pending payments reserve money but do not
   * reduce the actual debt yet.
   */

  const pendingAmount = payments
    .filter(
      (payment) =>
        payment.from_person_id === iou.from_person_id &&
        payment.to_person_id === iou.to_person_id &&
        payment.status === "pending",
    )
    .reduce((total, payment) => total + Number(payment.amount), 0);

  const originalAmount = Number(iou.amount);

  const remaining = Math.max(originalAmount - paidAmount, 0);

  /*
   * Prevent another payment from being submitted
   * for an amount already waiting for confirmation.
   */
  const availableToSubmit = Math.max(remaining - pendingAmount, 0);

  const settled = remaining <= 0;

  const hasPartialPayment = paidAmount > 0 && !settled;

  const hasPendingPayment = pendingAmount > 0 && !settled;

  /*
   * ------------------------------------------
   * Current user's role
   * ------------------------------------------
   */

  const selfPerson = people.find((person) => person.linked_user_id === user.id);

  const currentUserIsDebtor = selfPerson?.id === debtor.id;

  const currentUserIsCreditor = selfPerson?.id === creditor.id;

  const canRecordPayment =
    !settled &&
    availableToSubmit > 0 &&
    (currentUserIsDebtor || currentUserIsCreditor);

  /*
   * Debtor:
   *
   * Setting OFF
   * → payment becomes pending.
   *
   * Setting ON
   * → payment confirms immediately.
   *
   * Creditor:
   * → always records confirmed payment.
   */
  const requiresConfirmation =
    currentUserIsDebtor && !(group?.allow_debtor_self_confirm ?? false);

  /*
   * ------------------------------------------
   * UI
   * ------------------------------------------
   */

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
                {formatDateOnly(iou.iou_date)}
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

            {pendingAmount > 0 && (
              <p className="mt-1 text-xs font-medium text-amber-400">
                RM {pendingAmount.toFixed(2)} pending confirmation
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ProfileAvatar
                  name={debtorName}
                  avatarColor={debtor.avatar_color ?? "bg-blue-600"}
                  avatarPath={debtor.avatar_path}
                  className="size-8 text-xs"
                />

                <span className="truncate text-sm font-semibold">
                  {debtorName}
                </span>
              </div>

              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />

              <div className="flex min-w-0 items-center gap-2">
                <ProfileAvatar
                  name={creditorName}
                  avatarColor={creditor.avatar_color ?? "bg-blue-600"}
                  avatarPath={creditor.avatar_path}
                  className="size-8 text-xs"
                />

                <span className="truncate text-sm font-semibold">
                  {creditorName}
                </span>
              </div>
            </div>

            <p
              className={`mt-2 text-xs font-medium ${
                settled
                  ? "text-emerald-400"
                  : hasPendingPayment
                    ? "text-amber-400"
                    : hasPartialPayment
                      ? "text-amber-400"
                      : "text-red-400"
              }`}
            >
              {settled
                ? "Settled"
                : hasPendingPayment
                  ? "Payment pending"
                  : hasPartialPayment
                    ? "Partially paid"
                    : "Unpaid"}
            </p>
          </div>
        </section>

        {/* Payment summary */}
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Payment Summary
          </h2>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
            {/* Original */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-muted-foreground">
                Original amount
              </span>

              <span className="text-sm font-semibold">
                {formatMoney(originalAmount)}
              </span>
            </div>

            {/* Confirmed */}
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5">
              <span className="text-sm text-muted-foreground">
                Confirmed paid
              </span>

              <span className="text-sm font-semibold text-emerald-400">
                {formatMoney(paidAmount)}
              </span>
            </div>

            {/* Pending */}
            {pendingAmount > 0 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5">
                <span className="text-sm text-muted-foreground">Pending</span>

                <span className="text-sm font-semibold text-amber-400">
                  {formatMoney(pendingAmount)}
                </span>
              </div>
            )}

            {/* Remaining */}
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
              availableToSubmit={availableToSubmit}
              requiresConfirmation={requiresConfirmation}
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
              {payments.map((payment, index) => {
                const statusLabel =
                  payment.status === "confirmed"
                    ? "Confirmed"
                    : payment.status === "pending"
                      ? "Pending confirmation"
                      : "Rejected";

                const amountClass =
                  payment.status === "confirmed"
                    ? "text-emerald-400"
                    : payment.status === "pending"
                      ? "text-amber-400"
                      : "text-muted-foreground";

                return (
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
                          {formatTimestampDateMY(payment.paid_at)}
                        </p>

                        <p
                          className={`mt-1 text-xs font-medium ${amountClass}`}
                        >
                          {statusLabel}
                        </p>

                        {payment.note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {payment.note}
                          </p>
                        )}
                      </div>

                      <p className={`shrink-0 font-semibold ${amountClass}`}>
                        {formatMoney(Number(payment.amount))}
                      </p>
                    </div>

                    {/* Receiver reviews pending payment */}
                    {payment.status === "pending" && currentUserIsCreditor && (
                      <PaymentReviewActions
                        kind="iou"
                        paymentId={payment.id}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
