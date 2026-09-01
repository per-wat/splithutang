import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { ExpenseParticipantRow } from "@/components/expenses/expense-participant-row";
import { createClient } from "@/lib/supabase/server";
import { getPersonDisplayName } from "@/lib/person-display-name";

type ExpenseDetailPageProps = {
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

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default async function ExpenseDetailPage({
  params,
}: ExpenseDetailPageProps) {
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
   * Expense
   * ------------------------------------------
   */

  const { data: expense, error: expenseError } = await supabase
    .from("expenses")
    .select(
      `
        id,
        owner_id,
        group_id,
        name,
        expense_date,
        paid_by,
        split_method,
        total_amount
      `,
    )
    .eq("id", id)
    .maybeSingle();

  /*
   * RLS means an inaccessible expense normally
   * behaves the same as an expense that doesn't exist.
   */
  if (expenseError || !expense) {
    notFound();
  }

  /*
   * ------------------------------------------
   * Related data
   * ------------------------------------------
   */

  const [groupResult, participantsResult, paymentsResult, itemsResult] =
    await Promise.all([
      supabase
        .from("groups")
        .select("id, name, owner_id")
        .eq("id", expense.group_id)
        .maybeSingle(),

      supabase
        .from("expense_participants")
        .select("person_id, share_amount")
        .eq("expense_id", expense.id),

      supabase
        .from("expense_payments")
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
        .eq("expense_id", expense.id)
        .order("paid_at", {
          ascending: false,
        }),

      expense.split_method === "items"
        ? supabase
            .from("expense_items")
            .select("id, name, amount, sort_order")
            .eq("expense_id", expense.id)
            .order("sort_order")
        : Promise.resolve({
            data: [],
            error: null,
          }),
    ]);

  if (
    groupResult.error ||
    participantsResult.error ||
    paymentsResult.error ||
    itemsResult.error
  ) {
    console.error("Unable to load expense detail:", {
      group: groupResult.error,
      participants: participantsResult.error,
      payments: paymentsResult.error,
      items: itemsResult.error,
    });
  }

  const group = groupResult.data;

  const participants = participantsResult.data ?? [];

  const payments = paymentsResult.data ?? [];

  const items = itemsResult.data ?? [];

  /*
   * ------------------------------------------
   * Item data
   * ------------------------------------------
   */

  const itemIds = items.map((item) => item.id);

  const [addonsResult, itemParticipantsResult] =
    itemIds.length > 0
      ? await Promise.all([
          supabase
            .from("expense_item_addons")
            .select(
              `
                id,
                expense_item_id,
                name,
                amount,
                sort_order
              `,
            )
            .in("expense_item_id", itemIds)
            .order("sort_order"),

          supabase
            .from("expense_item_participants")
            .select("expense_item_id, person_id")
            .in("expense_item_id", itemIds),
        ])
      : [
          {
            data: [],
            error: null,
          },
          {
            data: [],
            error: null,
          },
        ];

  const addons = addonsResult.data ?? [];

  const itemParticipants = itemParticipantsResult.data ?? [];

  /*
   * ------------------------------------------
   * People
   * ------------------------------------------
   */

  const personIds = [
    ...new Set([
      expense.paid_by,

      ...participants.map((participant) => participant.person_id),

      ...payments.flatMap((payment) => [
        payment.from_person_id,
        payment.to_person_id,
      ]),

      ...itemParticipants.map((itemParticipant) => itemParticipant.person_id),
    ]),
  ];

  const { data: people, error: peopleError } = await supabase
    .from("people")
    .select(
      `
          id,
          name,
          avatar_color,
          linked_user_id
        `,
    )
    .in("id", personIds);

  if (peopleError) {
    console.error("Unable to load people:", peopleError);
  }

  const peopleMap = new Map(
    (people ?? []).map((person, index) => [
      person.id,
      {
        ...person,

        displayName: getPersonDisplayName(person, user.id),

        color:
          person.avatar_color ?? fallbackColors[index % fallbackColors.length],

        initial: person.name.trim().charAt(0).toUpperCase() || "?",
      },
    ]),
  );

  const payer = peopleMap.get(expense.paid_by);

  if (!payer) {
    notFound();
  }

  const selfPerson = (people ?? []).find(
    (person) => person.linked_user_id === user.id,
  );

  const isGroupOwner = group?.owner_id === user.id;

  /*
   * ------------------------------------------
   * Participant calculations
   * ------------------------------------------
   */

  const participantDetails = participants
    .map((participant) => {
      const person = peopleMap.get(participant.person_id);

      if (!person) {
        return null;
      }

      const shareAmount = Number(participant.share_amount);

      const isPayer = person.id === expense.paid_by;

      const paidAmount = isPayer
        ? 0
        : payments
            .filter(
              (payment) =>
                payment.from_person_id === person.id &&
                payment.to_person_id === expense.paid_by,
            )
            .reduce((total, payment) => total + Number(payment.amount), 0);

      const remaining = isPayer ? 0 : Math.max(shareAmount - paidAmount, 0);

      const canRecordPayment =
        !isPayer &&
        remaining > 0 &&
        (isGroupOwner ||
          selfPerson?.id === person.id ||
          selfPerson?.id === expense.paid_by);

      return {
        person,
        shareAmount,
        paidAmount,
        remaining,
        isPayer,
        canRecordPayment,
      };
    })
    .filter(
      (participant): participant is NonNullable<typeof participant> =>
        participant !== null,
    );

  /*
   * ------------------------------------------
   * UI
   * ------------------------------------------
   */

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <Link
            href="/expenses"
            aria-label="Back to expenses"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <h1 className="text-xl font-bold">Expense Details</h1>
        </header>

        {/* Main summary */}
        <section className="mt-3 rounded-2xl border border-white/[0.08] bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10">
              <Receipt className="size-5 text-blue-400" />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{expense.name}</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(expense.expense_date)}
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
              Total
            </p>

            <p className="mt-1 text-3xl font-bold tracking-tight">
              {formatMoney(Number(expense.total_amount))}
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              Paid by{" "}
              <span className="font-medium text-foreground">
                {payer.displayName}
              </span>
            </p>

            <p className="mt-1 text-xs capitalize text-muted-foreground">
              Split by{" "}
              {expense.split_method === "items"
                ? "items"
                : expense.split_method === "amount"
                  ? "amount"
                  : "equal"}
            </p>
          </div>
        </section>

        {/* Participants */}
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Split Details
          </h2>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
            {participantDetails.map((participant, index) => (
              <div
                key={participant.person.id}
                className={
                  index !== participantDetails.length - 1
                    ? "border-b border-white/[0.06]"
                    : ""
                }
              >
                <ExpenseParticipantRow
                  expenseId={expense.id}
                  person={{
                    ...participant.person,
                    name: participant.person.displayName,
                  }}
                  shareAmount={participant.shareAmount}
                  paidAmount={participant.paidAmount}
                  remaining={participant.remaining}
                  isPayer={participant.isPayer}
                  canRecordPayment={participant.canRecordPayment}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Item breakdown */}
        {expense.split_method === "items" && items.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Items
            </h2>

            <div className="space-y-3">
              {items.map((item) => {
                const itemAddons = addons.filter(
                  (addon) => addon.expense_item_id === item.id,
                );

                const sharingPeople = itemParticipants
                  .filter(
                    (itemParticipant) =>
                      itemParticipant.expense_item_id === item.id,
                  )
                  .map((itemParticipant) =>
                    peopleMap.get(itemParticipant.person_id),
                  )
                  .filter((person): person is NonNullable<typeof person> =>
                    Boolean(person),
                  );

                const itemTotal =
                  Number(item.amount) +
                  itemAddons.reduce(
                    (total, addon) => total + Number(addon.amount),
                    0,
                  );

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/[0.08] bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{item.name}</p>

                      <p className="shrink-0 font-bold">
                        {formatMoney(itemTotal)}
                      </p>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Base: {formatMoney(Number(item.amount))}
                    </p>

                    {sharingPeople.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Shared by{" "}
                        {sharingPeople
                          .map((person) => person.displayName)
                          .join(", ")}
                      </p>
                    )}

                    {itemAddons.length > 0 && (
                      <div className="mt-4 space-y-2 border-l-2 border-blue-500/30 pl-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Add-ons
                        </p>

                        {itemAddons.map((addon) => (
                          <div
                            key={addon.id}
                            className="flex justify-between gap-3 text-sm"
                          >
                            <span className="text-muted-foreground">
                              {addon.name}
                            </span>

                            <span className="font-medium">
                              {formatMoney(Number(addon.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Payment history */}
        {payments.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Payment History
            </h2>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {payments.map((payment, index) => {
                const from = peopleMap.get(payment.from_person_id);

                const to = peopleMap.get(payment.to_person_id);

                return (
                  <div
                    key={payment.id}
                    className={`px-4 py-4 ${
                      index !== payments.length - 1
                        ? "border-b border-white/[0.06]"
                        : ""
                    }`}
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">
                          {from?.displayName ?? "Unknown"} →{" "}
                          {to?.displayName ?? "Unknown"}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(payment.paid_at))}
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
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
