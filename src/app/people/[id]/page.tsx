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
import { DeleteLocalContactAction } from "@/components/people/delete-local-contact-action";

type PersonDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    expenses?: string;
    ious?: string;
    payments?: string;
  }>;
};

const PAGE_SIZE = 30;

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

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildPersonHref(
  personId: string,
  pages: {
    expenses: number;
    ious: number;
    payments: number;
  },
) {
  const query = new URLSearchParams();

  if (pages.expenses > 1) query.set("expenses", String(pages.expenses));
  if (pages.ious > 1) query.set("ious", String(pages.ious));
  if (pages.payments > 1) query.set("payments", String(pages.payments));

  const search = query.toString();
  return `/people/${personId}${search ? `?${search}` : ""}`;
}

type HistoryPaginationProps = {
  currentPage: number;
  totalCount: number;
  hrefForPage: (page: number) => string;
};

function HistoryPagination({
  currentPage,
  totalCount,
  hrefForPage,
}: HistoryPaginationProps) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (totalPages <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      {currentPage > 1 ? (
        <Link
          href={hrefForPage(currentPage - 1)}
          scroll={false}
          className="rounded-xl border border-white/[0.08] bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Previous
        </Link>
      ) : (
        <span />
      )}

      <span className="text-xs text-muted-foreground">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link
          href={hrefForPage(currentPage + 1)}
          scroll={false}
          className="rounded-xl border border-white/[0.08] bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

export default async function PersonDetailPage({
  params,
  searchParams,
}: PersonDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const expensePage = parsePage(query.expenses);
  const iouPage = parsePage(query.ious);
  const paymentPage = parsePage(query.payments);

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

  const [
    targetResult,
    selfResult,
    balancesResult,
    expensesResult,
    iousResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, name, avatar_color, avatar_path, linked_user_id, owner_id",
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("people")
      .select("id, name, avatar_color, avatar_path, linked_user_id")
      .eq("linked_user_id", user.id)
      .limit(1)
      .maybeSingle(),

    supabase.rpc("get_people_balances"),

    supabase.rpc("get_person_shared_expenses", {
      p_person_id: id,
      p_limit: PAGE_SIZE,
      p_offset: (expensePage - 1) * PAGE_SIZE,
    }),

    supabase.rpc("get_person_ious", {
      p_person_id: id,
      p_limit: PAGE_SIZE,
      p_offset: (iouPage - 1) * PAGE_SIZE,
    }),

    supabase.rpc("get_person_payment_history", {
      p_person_id: id,
      p_limit: PAGE_SIZE,
      p_offset: (paymentPage - 1) * PAGE_SIZE,
    }),
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

  if (expensesResult.error) {
    console.error("Unable to load shared expenses:", expensesResult.error);
    throw new Error("Unable to load shared expenses");
  }

  if (iousResult.error) {
    console.error("Unable to load direct IOUs:", iousResult.error);
    throw new Error("Unable to load direct IOUs");
  }

  if (paymentsResult.error) {
    console.error("Unable to load payment history:", paymentsResult.error);
    throw new Error("Unable to load payment history");
  }

  const target = targetResult.data;
  const self = selfResult.data;

  const isOwnedLocalContact =
    target.owner_id === user.id && target.linked_user_id === null;

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

  const expenses = (expensesResult.data ?? []).map((expense) => ({
    id: expense.expense_id,
    name: expense.name,
    expenseDate: expense.expense_date,
    totalAmount: Number(expense.total_amount),
    paidBy: expense.paid_by,
    selfShare: Number(expense.self_share),
    targetShare: Number(expense.target_share),
    targetPaidSelf: Number(expense.target_paid_self),
    selfPaidTarget: Number(expense.self_paid_target),
  }));

  const ious = (iousResult.data ?? []).map((iou) => ({
    id: iou.iou_id,
    reason: iou.reason,
    iouDate: iou.iou_date,
    originalAmount: Number(iou.original_amount),
    paidAmount: Number(iou.paid_amount),
    fromPersonId: iou.from_person_id,
  }));

  const paymentHistory = (paymentsResult.data ?? []).map((payment) => ({
    id: `${payment.payment_type}-${payment.payment_id}`,
    amount: Number(payment.amount),
    paidAt: payment.paid_at,
    note: payment.note,
    fromPersonId: payment.from_person_id,
    context: payment.context,
  }));

  const expenseTotal = Number(expensesResult.data?.[0]?.total_count ?? 0);
  const iouTotal = Number(iousResult.data?.[0]?.total_count ?? 0);
  const paymentTotal = Number(paymentsResult.data?.[0]?.total_count ?? 0);

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
      ? `${target.name} needs to pay you`
      : netBalance < 0
        ? `You need to pay ${target.name}`
        : "Nothing to pay";

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
                Money between you and {target.name}
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
              <p className="text-lg font-bold">{expenseTotal}</p>

              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Expenses
              </p>
            </div>

            <div className="rounded-xl bg-white/[0.04] px-2 py-3 text-center">
              <p className="text-lg font-bold">{iouTotal}</p>

              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Hutang
              </p>
            </div>

            <div className="rounded-xl bg-white/[0.04] px-2 py-3 text-center">
              <p className="text-lg font-bold">{paymentTotal}</p>

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
              {expenseTotal}
            </span>
          </div>

          {expenses.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {expenses.map((expense, index) => {
                const selfShare = expense.selfShare;

                const targetShare = expense.targetShare;

                let relationshipText = "Shared expense";

                let relationshipClass = "text-muted-foreground";

                let relationshipAmount: number | null = null;

                /*
                 * You paid.
                 */
                if (expense.paidBy === self.id) {
                  const remaining = Math.max(
                    targetShare - expense.targetPaidSelf,
                    0,
                  );

                  relationshipAmount = remaining;

                  if (remaining > 0) {
                    relationshipText = `${target.name} needs to pay you`;

                    relationshipClass = "text-emerald-400";
                  } else {
                    relationshipText = "Fully paid";

                    relationshipClass = "text-muted-foreground";
                  }
                } else if (expense.paidBy === target.id) {
                  /*
                   * They paid.
                   */
                  const remaining = Math.max(
                    selfShare - expense.selfPaidTarget,
                    0,
                  );

                  relationshipAmount = remaining;

                  if (remaining > 0) {
                    relationshipText = `You need to pay ${target.name}`;

                    relationshipClass = "text-red-400";
                  } else {
                    relationshipText = "Fully paid";

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
                              {formatDateOnly(expense.expenseDate)}
                            </p>
                          </div>

                          <p className="shrink-0 font-semibold">
                            {formatMoney(expense.totalAmount)}
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

          <HistoryPagination
            currentPage={expensePage}
            totalCount={expenseTotal}
            hrefForPage={(page) =>
              buildPersonHref(id, {
                expenses: page,
                ious: iouPage,
                payments: paymentPage,
              })
            }
          />
        </section>

        {/* Hutang */}
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Hutang
            </h2>

            <span className="text-xs text-muted-foreground">{iouTotal}</span>
          </div>

          {ious.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {ious.map((iou, index) => {
                const paidAmount = iou.paidAmount;

                const original = iou.originalAmount;

                const remaining = Math.max(original - paidAmount, 0);

                const targetOwes = iou.fromPersonId === target.id;

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
                              {formatDateOnly(iou.iouDate)}
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
                            ? "Fully paid"
                            : targetOwes
                              ? `${target.name} needs to pay you`
                              : `You need to pay ${target.name}`}
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
                No Hutang between you yet.
              </p>
            </div>
          )}

          <HistoryPagination
            currentPage={iouPage}
            totalCount={iouTotal}
            hrefForPage={(page) =>
              buildPersonHref(id, {
                expenses: expensePage,
                ious: page,
                payments: paymentPage,
              })
            }
          />
        </section>

        {/* Payment history */}
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Payment History
            </h2>

            <span className="text-xs text-muted-foreground">
              {paymentTotal}
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

          <HistoryPagination
            currentPage={paymentPage}
            totalCount={paymentTotal}
            hrefForPage={(page) =>
              buildPersonHref(id, {
                expenses: expensePage,
                ious: iouPage,
                payments: page,
              })
            }
          />
        </section>

        {isOwnedLocalContact && (
          <DeleteLocalContactAction
            personId={target.id}
            personName={target.name}
          />
        )}
      </div>
    </main>
  );
}
