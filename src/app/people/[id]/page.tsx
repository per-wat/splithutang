import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  FileText,
  Receipt,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { formatDateOnly, formatTimestampDateMY } from "@/lib/date-format";
import { ProfileAvatar } from "@/components/profile/profile-avatar";

type PersonDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const fallbackColors = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-orange-600",
  "bg-emerald-600",
  "bg-cyan-600",
];

function formatMoney(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export default async function PersonDetailPage({
  params,
}: PersonDetailPageProps) {
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
   * Current person + selected person
   * ------------------------------------------
   */

  const [targetResult, selfResult, balancesResult] = await Promise.all([
    supabase
      .from("people")
      .select("id, name, avatar_color, avatar_path, linked_user_id")
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("people")
      .select("id, name, avatar_color, avatar_path, linked_user_id")
      .eq("linked_user_id", user.id)
      .limit(1)
      .maybeSingle(),

    supabase.rpc("get_people_balances"),
  ]);

  if (balancesResult.error) {
    console.error("Unable to load person balance:", balancesResult.error);

    throw new Error("Unable to load person balance");
  }

  if (targetResult.error || !targetResult.data) {
    notFound();
  }

  if (selfResult.error || !selfResult.data) {
    console.error(
      "Unable to resolve current user's person record:",
      selfResult.error,
    );

    notFound();
  }

  const target = targetResult.data;
  const self = selfResult.data;

  /*
   * Don't allow /people/<your-own-id>.
   */
  if (target.id === self.id) {
    redirect("/people");
  }

  const balanceRow = (balancesResult.data ?? []).find(
    (row) => row.person_id === target.id,
  );

  const netBalance = Number(balanceRow?.balance ?? 0);

  /*
   * ------------------------------------------
   * Shared expense participation
   * ------------------------------------------
   */

  const { data: participantRows, error: participantError } = await supabase
    .from("expense_participants")
    .select(
      `
        expense_id,
        person_id,
        share_amount
      `,
    )
    .in("person_id", [self.id, target.id]);

  if (participantError) {
    console.error(
      "Unable to load shared expense participants:",
      participantError,
    );
    throw new Error("Unable to load shared expense participants");
  }

  const participantData = participantRows ?? [];

  /*
   * Find expense IDs containing BOTH people.
   */
  const participationMap = new Map<string, Set<string>>();

  for (const row of participantData) {
    const existing = participationMap.get(row.expense_id) ?? new Set<string>();

    existing.add(row.person_id);

    participationMap.set(row.expense_id, existing);
  }

  const sharedExpenseIds = [...participationMap.entries()]
    .filter(([, people]) => people.has(self.id) && people.has(target.id))
    .map(([expenseId]) => expenseId);

  let expenses: {
    id: string;
    name: string;
    expense_date: string;
    total_amount: number;
    paid_by: string;
    group_id: string;
    created_at: string;
  }[] = [];

  let expensePayments: {
    id: string;
    expense_id: string;
    from_person_id: string;
    to_person_id: string;
    amount: number;
    paid_at: string;
    note: string | null;
    status: "pending" | "confirmed" | "rejected";
  }[] = [];

  if (sharedExpenseIds.length > 0) {
    const [expensesResult, expensePaymentsResult] = await Promise.all([
      supabase
        .from("expenses")
        .select(
          `
            id,
            name,
            expense_date,
            total_amount,
            paid_by,
            group_id,
            created_at
          `,
        )
        .in("id", sharedExpenseIds)
        .order("expense_date", {
          ascending: false,
        }),

      supabase
        .from("expense_payments")
        .select(
          `
            id,
            expense_id,
            from_person_id,
            to_person_id,
            amount,
            paid_at,
            note,
            status
          `,
        )
        .in("expense_id", sharedExpenseIds)
        .order("paid_at", {
          ascending: false,
        }),
    ]);

    if (expensesResult.error) {
      console.error("Unable to load shared expenses:", expensesResult.error);
      throw new Error("Unable to load shared expenses");
    }

    if (expensePaymentsResult.error) {
      console.error(
        "Unable to load expense payments:",
        expensePaymentsResult.error,
      );
      throw new Error("Unable to load expense payments");
    }

    expenses = (expensesResult.data ?? []).map((expense) => ({
      ...expense,
      total_amount: Number(expense.total_amount),
    }));

    expensePayments = (expensePaymentsResult.data ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    }));
  }

  /*
   * ------------------------------------------
   * Direct IOUs between the two people
   * ------------------------------------------
   */

  const [selfToTargetResult, targetToSelfResult] = await Promise.all([
    supabase
      .from("ious")
      .select(
        `
          id,
          reason,
          iou_date,
          amount,
          from_person_id,
          to_person_id,
          group_id,
          created_at
        `,
      )
      .eq("from_person_id", self.id)
      .eq("to_person_id", target.id),

    supabase
      .from("ious")
      .select(
        `
          id,
          reason,
          iou_date,
          amount,
          from_person_id,
          to_person_id,
          group_id,
          created_at
        `,
      )
      .eq("from_person_id", target.id)
      .eq("to_person_id", self.id),
  ]);

  if (selfToTargetResult.error) {
    console.error("Unable to load outgoing IOUs:", selfToTargetResult.error);
    throw new Error("Unable to load outgoing IOUs");
  }

  if (targetToSelfResult.error) {
    console.error("Unable to load incoming IOUs:", targetToSelfResult.error);
    throw new Error("Unable to load incoming IOUs");
  }

  const ious = [
    ...(selfToTargetResult.data ?? []),
    ...(targetToSelfResult.data ?? []),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const iouIds = ious.map((iou) => iou.id);

  let iouPayments: {
    id: string;
    iou_id: string;
    from_person_id: string;
    to_person_id: string;
    amount: number;
    paid_at: string;
    note: string | null;
    status: "pending" | "confirmed" | "rejected";
  }[] = [];

  if (iouIds.length > 0) {
    const { data, error } = await supabase
      .from("iou_payments")
      .select(
        `
          id,
          iou_id,
          from_person_id,
          to_person_id,
          amount,
          paid_at,
          note,
          status
        `,
      )
      .in("iou_id", iouIds)
      .order("paid_at", {
        ascending: false,
      });

    if (error) {
      console.error("Unable to load IOU payments:", error);
      throw new Error("Unable to load IOU payments");
    }

    iouPayments = (data ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    }));
  }

  /*
   * ------------------------------------------
   * Share lookup
   * ------------------------------------------
   */

  function getShare(expenseId: string, personId: string) {
    const row = participantData.find(
      (participant) =>
        participant.expense_id === expenseId &&
        participant.person_id === personId,
    );

    return Number(row?.share_amount ?? 0);
  }

  const confirmedExpensePayments = expensePayments.filter(
    (payment) => payment.status === "confirmed",
  );

  const confirmedIouPayments = iouPayments.filter(
    (payment) => payment.status === "confirmed",
  );

  /*
   * ------------------------------------------
   * Payment history between these two people
   * ------------------------------------------
   */

  const directExpensePayments = confirmedExpensePayments.filter(
    (payment) =>
      (payment.from_person_id === self.id &&
        payment.to_person_id === target.id) ||
      (payment.from_person_id === target.id &&
        payment.to_person_id === self.id),
  );

  const directIouPayments = confirmedIouPayments.filter(
    (payment) =>
      (payment.from_person_id === self.id &&
        payment.to_person_id === target.id) ||
      (payment.from_person_id === target.id &&
        payment.to_person_id === self.id),
  );

  const paymentHistory = [
    ...directExpensePayments.map((payment) => {
      const expense = expenses.find((item) => item.id === payment.expense_id);

      return {
        id: `expense-${payment.id}`,
        amount: payment.amount,
        paidAt: payment.paid_at,
        note: payment.note,
        fromPersonId: payment.from_person_id,
        toPersonId: payment.to_person_id,
        context: expense?.name ?? "Expense payment",
      };
    }),

    ...directIouPayments.map((payment) => {
      const iou = ious.find((item) => item.id === payment.iou_id);

      return {
        id: `iou-${payment.id}`,
        amount: payment.amount,
        paidAt: payment.paid_at,
        note: payment.note,
        fromPersonId: payment.from_person_id,
        toPersonId: payment.to_person_id,
        context: iou?.reason ?? "IOU payment",
      };
    }),
  ].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  /*
   * ------------------------------------------
   * Avatar
   * ------------------------------------------
   */

  const targetColor =
    target.avatar_color ??
    fallbackColors[target.name.length % fallbackColors.length];

  /*
   * ------------------------------------------
   * Net balance presentation
   * ------------------------------------------
   */

  const balanceLabel =
    netBalance > 0
      ? `${target.name} owes you`
      : netBalance < 0
        ? `You owe ${target.name}`
        : "All settled";

  const balanceClass =
    netBalance > 0
      ? "text-emerald-400"
      : netBalance < 0
        ? "text-red-400"
        : "text-muted-foreground";

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        {/* Header */}
        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <Link
            href="/people"
            aria-label="Back to people"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <h1 className="text-xl font-bold">Person Details</h1>
        </header>

        {/* Person summary */}
        <section className="mt-3 rounded-2xl border border-white/[0.08] bg-card p-5">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              name={target.name}
              avatarColor={targetColor}
              avatarPath={target.avatar_path}
              className="size-14 text-lg"
            />

            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold">{target.name}</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Your balance together
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <p className={`text-sm font-medium ${balanceClass}`}>
              {balanceLabel}
            </p>

            <p
              className={`mt-1 text-3xl font-bold tracking-tight ${balanceClass}`}
            >
              {formatMoney(Math.abs(netBalance))}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/[0.04] px-2 py-3 text-center">
              <p className="text-lg font-bold">{expenses.length}</p>

              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Expenses
              </p>
            </div>

            <div className="rounded-xl bg-white/[0.04] px-2 py-3 text-center">
              <p className="text-lg font-bold">{ious.length}</p>

              <p className="mt-0.5 text-[11px] text-muted-foreground">IOUs</p>
            </div>

            <div className="rounded-xl bg-white/[0.04] px-2 py-3 text-center">
              <p className="text-lg font-bold">{paymentHistory.length}</p>

              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Payments
              </p>
            </div>
          </div>
        </section>

        {/* Shared expenses */}
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Shared Expenses
            </h2>

            <span className="text-xs text-muted-foreground">
              {expenses.length}
            </span>
          </div>

          {expenses.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {expenses.map((expense, index) => {
                const selfShare = getShare(expense.id, self.id);

                const targetShare = getShare(expense.id, target.id);

                let relationshipText = "Shared expense";

                let relationshipClass = "text-muted-foreground";

                let relationshipAmount: number | null = null;

                /*
                 * You paid.
                 */
                if (expense.paid_by === self.id) {
                  const paid = confirmedExpensePayments
                    .filter(
                      (payment) =>
                        payment.expense_id === expense.id &&
                        payment.from_person_id === target.id &&
                        payment.to_person_id === self.id,
                    )
                    .reduce((total, payment) => total + payment.amount, 0);

                  const remaining = Math.max(targetShare - paid, 0);

                  relationshipAmount = remaining;

                  if (remaining > 0) {
                    relationshipText = `${target.name} owes you`;

                    relationshipClass = "text-emerald-400";
                  } else {
                    relationshipText = "Settled";

                    relationshipClass = "text-muted-foreground";
                  }
                } else if (expense.paid_by === target.id) {
                  /*
                   * They paid.
                   */
                  const paid = confirmedExpensePayments
                    .filter(
                      (payment) =>
                        payment.expense_id === expense.id &&
                        payment.from_person_id === self.id &&
                        payment.to_person_id === target.id,
                    )
                    .reduce((total, payment) => total + payment.amount, 0);

                  const remaining = Math.max(selfShare - paid, 0);

                  relationshipAmount = remaining;

                  if (remaining > 0) {
                    relationshipText = `You owe ${target.name}`;

                    relationshipClass = "text-red-400";
                  } else {
                    relationshipText = "Settled";

                    relationshipClass = "text-muted-foreground";
                  }
                }

                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className={`block px-4 py-4 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05] ${
                      index !== expenses.length - 1
                        ? "border-b border-white/[0.06]"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/10">
                        <Receipt className="size-4 text-blue-400" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {expense.name}
                            </p>

                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDateOnly(expense.expense_date)}
                            </p>
                          </div>

                          <p className="shrink-0 font-semibold">
                            {formatMoney(expense.total_amount)}
                          </p>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p
                            className={`text-xs font-medium ${relationshipClass}`}
                          >
                            {relationshipText}
                          </p>

                          {relationshipAmount !== null && (
                            <p
                              className={`text-xs font-semibold ${relationshipClass}`}
                            >
                              {formatMoney(relationshipAmount)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-8 text-center">
              <Receipt className="mx-auto size-5 text-muted-foreground" />

              <p className="mt-2 text-sm text-muted-foreground">
                No shared expenses yet.
              </p>
            </div>
          )}
        </section>

        {/* IOUs */}
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              IOUs
            </h2>

            <span className="text-xs text-muted-foreground">{ious.length}</span>
          </div>

          {ious.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {ious.map((iou, index) => {
                const paidAmount = confirmedIouPayments
                  .filter((payment) => payment.iou_id === iou.id)
                  .reduce((total, payment) => total + payment.amount, 0);

                const original = Number(iou.amount);

                const remaining = Math.max(original - paidAmount, 0);

                const targetOwes = iou.from_person_id === target.id;

                const settled = remaining <= 0;

                return (
                  <Link
                    key={iou.id}
                    href={`/ious/${iou.id}`}
                    className={`block px-4 py-4 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05] ${
                      index !== ious.length - 1
                        ? "border-b border-white/[0.06]"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
                        <FileText className="size-4 text-purple-400" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {iou.reason}
                            </p>

                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDateOnly(iou.iou_date)}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="font-semibold">
                              {formatMoney(remaining)}
                            </p>

                            {paidAmount > 0 && (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                of {formatMoney(original)}
                              </p>
                            )}
                          </div>
                        </div>

                        <p
                          className={`mt-2 text-xs font-medium ${
                            settled
                              ? "text-muted-foreground"
                              : targetOwes
                                ? "text-emerald-400"
                                : "text-red-400"
                          }`}
                        >
                          {settled
                            ? "Settled"
                            : targetOwes
                              ? `${target.name} owes you`
                              : `You owe ${target.name}`}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-8 text-center">
              <FileText className="mx-auto size-5 text-muted-foreground" />

              <p className="mt-2 text-sm text-muted-foreground">
                No IOUs between you yet.
              </p>
            </div>
          )}
        </section>

        {/* Payment history */}
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Payment History
            </h2>

            <span className="text-xs text-muted-foreground">
              {paymentHistory.length}
            </span>
          </div>

          {paymentHistory.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {paymentHistory.map((payment, index) => {
                const youPaid = payment.fromPersonId === self.id;

                return (
                  <div
                    key={payment.id}
                    className={`px-4 py-4 ${
                      index !== paymentHistory.length - 1
                        ? "border-b border-white/[0.06]"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                        <Banknote className="size-4 text-emerald-400" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {youPaid
                                ? `You paid ${target.name}`
                                : `${target.name} paid you`}
                            </p>

                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {payment.context}
                            </p>
                          </div>

                          <p className="shrink-0 font-semibold text-emerald-400">
                            {formatMoney(payment.amount)}
                          </p>
                        </div>

                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{youPaid ? "You" : target.name}</span>

                          <ArrowRight className="size-3" />

                          <span>{youPaid ? target.name : "You"}</span>

                          <span>·</span>

                          <span>{formatTimestampDateMY(payment.paidAt)}</span>
                        </div>

                        {payment.note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {payment.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-8 text-center">
              <Banknote className="mx-auto size-5 text-muted-foreground" />

              <p className="mt-2 text-sm text-muted-foreground">
                No payments between you yet.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
