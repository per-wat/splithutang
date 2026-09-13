"use client";
import { createClient } from "@/lib/supabase/client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plus, ScanLine } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import {
  ExpenseItemEditor,
  type ExpenseItem,
  type SubItem,
} from "./expense-item-editor";

import { ExpensePeopleSelector, type Person } from "./expense-people-selector";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import {
  calculateReceiptReviewItemTotal,
  parseReceiptReviewMoney,
  type ReceiptReviewDraft,
} from "@/lib/receipts/build-receipt-review-draft";

const ReceiptImportDialog = dynamic(
  () =>
    import("@/components/receipts/receipt-import-dialog").then(
      (module) => module.ReceiptImportDialog,
    ),
  { ssr: false },
);

export type ExpenseGroupOption = {
  id: string;
  name: string;
  people: Person[];
};

type AddExpenseFormProps = {
  groups: ExpenseGroupOption[];
};

type SplitMethod = "equal" | "amount" | "items";

type ReceiptBreakdown = {
  serviceCharge: number;
  tax: number;
  rounding: number;
};

const createId = () => crypto.randomUUID();

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const createEmptyItem = (selectedPeople: string[]): ExpenseItem => ({
  id: createId(),
  name: "",
  amount: "",
  quantity: "1",
  people: [...selectedPeople],
  subItems: [],
});

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function AddExpenseForm({ groups }: AddExpenseFormProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  const people = selectedGroup?.people ?? [];

  const selfPerson = people.find((person) => person.isSelf);

  const [expenseName, setExpenseName] = useState("");

  const [date, setDate] = useState(getLocalDate());

  const initialPersonIds = people.map((person) => person.id);

  const [paidBy, setPaidBy] = useState(selfPerson?.id ?? people[0]?.id ?? "");

  const [selectedPeople, setSelectedPeople] =
    useState<string[]>(initialPersonIds);

  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");

  const [totalExpense, setTotalExpense] = useState("");

  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(people.map((person) => [person.id, "0.00"])),
  );

  const [items, setItems] = useState<ExpenseItem[]>([
    createEmptyItem(initialPersonIds),
  ]);

  const [receiptBreakdown, setReceiptBreakdown] =
    useState<ReceiptBreakdown | null>(null);

  const [showReceiptScanner, setShowReceiptScanner] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  /*
   * ------------------------------------------
   * Calculations
   * ------------------------------------------
   */

  const itemsTotal = useMemo(() => {
    return roundMoney(
      items.reduce((total, item) => {
        const mainAmount = Number(item.amount) || 0;

        const addOnsTotal = item.subItems.reduce(
          (sum, subItem) => sum + (Number(subItem.amount) || 0),
          0,
        );

        return total + mainAmount + addOnsTotal;
      }, 0),
    );
  }, [items]);

  const amountSplitTotal = useMemo(() => {
    return selectedPeople.reduce(
      (total, personId) => total + (Number(amounts[personId]) || 0),
      0,
    );
  }, [amounts, selectedPeople]);

  const totalAmount = useMemo(() => {
    if (splitMethod === "items") {
      return roundMoney(
        itemsTotal +
          (receiptBreakdown?.serviceCharge ?? 0) +
          (receiptBreakdown?.tax ?? 0) +
          (receiptBreakdown?.rounding ?? 0),
      );
    }

    if (splitMethod === "amount") {
      return amountSplitTotal;
    }

    return roundMoney(Number(totalExpense) || 0);
  }, [
    splitMethod,
    totalExpense,
    itemsTotal,
    amountSplitTotal,
    receiptBreakdown,
  ]);

  const equalShares = useMemo(() => {
    if (selectedPeople.length === 0) {
      return {} as Record<string, number>;
    }

    const totalCents = Math.round(totalAmount * 100);
    const baseCents = Math.floor(totalCents / selectedPeople.length);
    const remainder = totalCents % selectedPeople.length;

    return Object.fromEntries(
      selectedPeople.map((personId, index) => [
        personId,
        (baseCents + (index < remainder ? 1 : 0)) / 100,
      ]),
    ) as Record<string, number>;
  }, [selectedPeople, totalAmount]);

  /*
   * ------------------------------------------
   * People
   * ------------------------------------------
   */

  const togglePerson = (personId: string) => {
    setSelectedPeople((current) => {
      const removing = current.includes(personId);

      const next = removing
        ? current.filter((id) => id !== personId)
        : [...current, personId];

      if (removing) {
        setItems((currentItems) =>
          currentItems.map((item) => ({
            ...item,
            people: item.people.filter((id) => id !== personId),
          })),
        );
      }

      return next;
    });
  };

  const togglePaidBy = (personId: string) => {
    setPaidBy(personId);

    /*
     * If payer isn't involved yet,
     * automatically include them.
     */
    if (!selectedPeople.includes(personId)) {
      setSelectedPeople((current) => [...current, personId]);
    }
  };

  /*
   * ------------------------------------------
   * Amount split
   * ------------------------------------------
   */

  const updateAmount = (personId: string, value: string) => {
    setAmounts((current) => ({
      ...current,
      [personId]: value,
    }));
  };

  /*
   * ------------------------------------------
   * Items
   * ------------------------------------------
   */

  const addItem = () => {
    setItems((current) => [...current, createEmptyItem(selectedPeople)]);
  };

  const removeItem = (itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
  };

  const updateItem = (
    itemId: string,
    field: "name" | "amount" | "quantity",
    value: string,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  };

  const toggleItemPerson = (itemId: string, personId: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const peopleForItem = item.people.includes(personId)
          ? item.people.filter((id) => id !== personId)
          : [...item.people, personId];

        return {
          ...item,
          people: peopleForItem,
        };
      }),
    );
  };

  /*
   * ------------------------------------------
   * Add-ons
   * ------------------------------------------
   */

  const addSubItem = (itemId: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              subItems: [
                ...item.subItems,
                {
                  id: createId(),
                  name: "",
                  amount: "",
                  quantity: "1",
                },
              ],
            }
          : item,
      ),
    );
  };

  const removeSubItem = (itemId: string, subItemId: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              subItems: item.subItems.filter(
                (subItem) => subItem.id !== subItemId,
              ),
            }
          : item,
      ),
    );
  };

  const updateSubItem = (
    itemId: string,
    subItemId: string,
    field: keyof Pick<SubItem, "name" | "amount" | "quantity">,
    value: string,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              subItems: item.subItems.map((subItem) =>
                subItem.id === subItemId
                  ? {
                      ...subItem,
                      [field]: value,
                    }
                  : subItem,
              ),
            }
          : item,
      ),
    );
  };

  function importReceiptDraft(draft: ReceiptReviewDraft) {
    const importedItems: ExpenseItem[] = draft.items
      .filter((item) => item.kind === "item")
      .map((item) => ({
        id: createId(),
        name: item.name.trim(),
        amount: item.amount,
        quantity: item.quantity,
        people: [...selectedPeople],
        subItems: draft.items
          .filter(
            (candidate) =>
              candidate.kind === "addon" && candidate.parentId === item.id,
          )
          .map((addon) => ({
            id: createId(),
            name: addon.name.trim(),
            amount: addon.amount || "0.00",
            quantity: addon.quantity,
          })),
      }));

    const serviceCharge =
      parseReceiptReviewMoney(draft.serviceCharge.value) ?? 0;
    const tax = parseReceiptReviewMoney(draft.tax.value) ?? 0;
    const rounding = parseReceiptReviewMoney(draft.rounding.value) ?? 0;
    const finalTotal = parseReceiptReviewMoney(draft.total.value) ?? 0;

    setExpenseName(draft.merchant.value.trim());
    setDate(draft.receiptDate.value);
    setItems(importedItems);
    setSplitMethod("items");
    setTotalExpense(finalTotal.toFixed(2));
    setReceiptBreakdown({ serviceCharge, tax, rounding });
    setShowReceiptScanner(false);

    const importedSubtotal = calculateReceiptReviewItemTotal(draft);
    const importedTotal = roundMoney(
      importedSubtotal + serviceCharge + tax + rounding,
    );

    if (importedTotal !== finalTotal) {
      setError("The imported receipt totals no longer reconcile.");
    } else {
      setError("");
    }
  }

  /*
   * ------------------------------------------
   * Validation
   * ------------------------------------------
   */

  const hasValidBasicInfo =
    expenseName.trim().length > 0 &&
    date.trim().length > 0 &&
    selectedPeople.length > 0 &&
    paidBy.length > 0;

  const validItems =
    items.length > 0 &&
    items.every(
      (item) =>
        item.name.trim().length > 0 &&
        /^\d+$/.test(item.quantity) &&
        Number(item.quantity) >= 1 &&
        Number(item.amount || 0) >= 0 &&
        item.people.length > 0 &&
        item.subItems.every(
          (subItem) =>
            subItem.name.trim().length > 0 &&
            /^\d+$/.test(subItem.quantity) &&
            Number(subItem.quantity) >= 1 &&
            Number(subItem.amount || 0) >= 0,
        ),
    );

  const hasValidSplit =
    totalAmount > 0 && (splitMethod !== "items" || validItems);

  const canSave =
    selectedGroupId.length > 0 && hasValidBasicInfo && hasValidSplit;

  /*
   * ------------------------------------------
   * Save
   * ------------------------------------------
   */

  async function handleSave() {
    if (!canSave || saving) {
      return;
    }

    setSaving(true);
    setError("");

    const participants = selectedPeople.map((personId) => ({
      person_id: personId,

      share_amount:
        splitMethod === "amount" ? Number(amounts[personId] || 0) : null,
    }));

    const expenseItems =
      splitMethod === "items"
        ? items.map((item) => ({
            name: item.name.trim(),

            amount: Number(item.amount) || 0,

            quantity: Number(item.quantity),

            people: item.people,

            sub_items: item.subItems.map((subItem) => ({
              name: subItem.name.trim(),

              amount: Number(subItem.amount) || 0,

              quantity: Number(subItem.quantity),
            })),
          }))
        : [];

    const { error } = await supabase.rpc("create_expense", {
      p_group_id: selectedGroupId,

      p_name: expenseName.trim(),

      p_expense_date: date,

      p_paid_by: paidBy,

      p_split_method: splitMethod,

      p_total_amount: totalAmount,

      p_participants: participants,

      p_items: expenseItems,

      p_receipt_summary:
        splitMethod === "items" && receiptBreakdown
          ? {
              subtotal: itemsTotal,
              service_charge: receiptBreakdown.serviceCharge,
              tax: receiptBreakdown.tax,
              rounding: receiptBreakdown.rounding,
            }
          : null,
    });

    if (error) {
      console.error("Unable to create expense:", error);

      setError(error.message);
      setSaving(false);

      return;
    }

    router.push("/expenses");
    router.refresh();
  }

  function handleGroupChange(groupId: string) {
    const group = groups.find((item) => item.id === groupId);

    setSelectedGroupId(groupId);

    if (!group) {
      setPaidBy("");
      setSelectedPeople([]);
      setAmounts({});
      setItems([]);
      return;
    }

    const groupPersonIds = group.people.map((person) => person.id);

    const self = group.people.find((person) => person.isSelf);

    setPaidBy(self?.id ?? group.people[0]?.id ?? "");

    setSelectedPeople(groupPersonIds);

    setAmounts(
      Object.fromEntries(group.people.map((person) => [person.id, "0.00"])),
    );

    setItems([createEmptyItem(groupPersonIds)]);
    setReceiptBreakdown(null);
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10">
      {/* Header */}
      <header className="sticky top-0 z-20 -mx-4 bg-background px-4 pb-3 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>

          <h1 className="text-xl font-bold">Add Expense</h1>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
          <p className="font-medium">No groups available</p>

          <p className="mt-1 text-sm text-muted-foreground">
            Create a group before adding an expense.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold">Have a receipt?</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Scan it on this device, review the result, then populate this
                  form.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptScanner(true)}
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-500"
              >
                <ScanLine className="size-4" />
                Scan
              </button>
            </div>
          </section>

          {/* Basic information */}
          <section className="mt-3">
            <h2 className="mb-4 text-sm font-bold">Basic Information</h2>

            <div>
              <label
                htmlFor="expense-group"
                className="mb-2 block text-sm font-semibold"
              >
                Group
              </label>

              <select
                id="expense-group"
                value={selectedGroupId}
                onChange={(event) => handleGroupChange(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-blue-500"
              >
                {groups.map((group) => (
                  <option
                    key={group.id}
                    value={group.id}
                  >
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="expense-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Expense Name
                </label>

                <input
                  id="expense-name"
                  value={expenseName}
                  onChange={(event) => setExpenseName(event.target.value)}
                  placeholder="e.g. Dinner at Mamak"
                  className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="expense-date"
                  className="mb-2 block text-sm font-semibold"
                >
                  Date
                </label>

                <input
                  id="expense-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Person who paid */}
          <section className="mt-7">
            <h2 className="mb-3 text-sm font-bold">Who paid?</h2>

            <div className="flex flex-wrap gap-2">
              {people.map((person) => {
                const active = paidBy === person.id;

                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => togglePaidBy(person.id)}
                    className={`flex items-center gap-2 rounded-full border px-2 py-1.5 pr-3 transition-colors ${
                      active
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-border bg-card hover:bg-white/[0.04]"
                    }`}
                  >
                    <ProfileAvatar
                      name={person.name}
                      avatarColor={person.color}
                      avatarPath={person.avatarPath}
                      className="size-8 text-sm"
                    />

                    <span className="text-sm font-medium">{person.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* People sharing the expense */}
          <section className="mt-7">
            <h2 className="mb-3 text-sm font-bold">
              Who shared this expense?
            </h2>

            <ExpensePeopleSelector
              people={people}
              selectedPeople={selectedPeople}
              onToggle={togglePerson}
              personPaying={paidBy}
            />
          </section>

          {/* Split method */}
          <section className="mt-7">
            <h2 className="mb-3 text-sm font-bold">
              How should it be divided?
            </h2>

            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "equal",
                  label: "Equal",
                },
                {
                  id: "amount",
                  label: "By Amount",
                },
                {
                  id: "items",
                  label: "By Items",
                },
              ].map((method) => {
                const active = splitMethod === method.id;

                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSplitMethod(method.id as SplitMethod)}
                    className={`h-11 rounded-full border text-xs font-semibold transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-border bg-card text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    }`}
                  >
                    {method.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Equal */}
          {splitMethod === "equal" && (
            <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="p-4">
                <label
                  htmlFor="total-expense"
                  className="text-sm font-semibold"
                >
                  Total Amount (RM)
                </label>

                <input
                  id="total-expense"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={totalExpense}
                  onChange={(event) => setTotalExpense(event.target.value)}
                  placeholder="0.00"
                  className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
                />
              </div>

              <div className="border-t border-border">
                {people
                  .filter((person) => selectedPeople.includes(person.id))
                  .map((person, index, list) => (
                    <div
                      key={person.id}
                      className={`flex items-center justify-between px-4 py-3.5 ${
                        index !== list.length - 1
                          ? "border-b border-border"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <ProfileAvatar
                          name={person.name}
                          avatarColor={person.color}
                          avatarPath={person.avatarPath}
                          className="size-9 text-sm"
                        />

                        <span className="text-sm font-semibold">
                          {person.name}
                        </span>
                      </div>

                      <span className="font-bold">
                        RM {(equalShares[person.id] ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="flex justify-between border-t border-border bg-white/[0.03] px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total</span>

                <span className="font-bold">RM {totalAmount.toFixed(2)}</span>
              </div>
            </section>
          )}

          {/* By Amount */}
          {splitMethod === "amount" && (
            <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
              {people
                .filter((person) => selectedPeople.includes(person.id))
                .map((person, index, list) => (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between px-4 py-3.5 ${
                      index !== list.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ProfileAvatar
                        name={person.name}
                        avatarColor={person.color}
                        avatarPath={person.avatarPath}
                        className="size-9 text-sm"
                      />

                      <span className="text-sm font-semibold">
                        {person.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 border-b border-border">
                      <span className="text-sm text-muted-foreground">RM</span>

                      <input
                        value={amounts[person.id]}
                        onChange={(event) =>
                          updateAmount(person.id, event.target.value)
                        }
                        className="w-20 bg-transparent py-1 text-right text-sm font-semibold outline-none"
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                ))}

              <div className="flex justify-between border-t border-border bg-white/[0.03] px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total</span>

                <span className="font-bold">RM {totalAmount.toFixed(2)}</span>
              </div>
            </section>
          )}

          {/* By Items */}
          {splitMethod === "items" && (
            <section className="mt-4 space-y-3">
              {receiptBreakdown && (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">Receipt adjustments</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Distributed proportionally from assigned item shares
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReceiptBreakdown(null)}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 border-t border-blue-500/10 pt-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        Item subtotal
                      </span>
                      <span>RM {itemsTotal.toFixed(2)}</span>
                    </div>
                    {receiptBreakdown.serviceCharge !== 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Service charge
                        </span>
                        <span>
                          RM {receiptBreakdown.serviceCharge.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {receiptBreakdown.tax !== 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Tax</span>
                        <span>RM {receiptBreakdown.tax.toFixed(2)}</span>
                      </div>
                    )}
                    {receiptBreakdown.rounding !== 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Rounding</span>
                        <span>
                          {receiptBreakdown.rounding < 0 ? "-" : ""}RM{" "}
                          {Math.abs(receiptBreakdown.rounding).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {items.map((item) => (
                <ExpenseItemEditor
                  key={item.id}
                  item={item}
                  people={people.filter((person) =>
                    selectedPeople.includes(person.id),
                  )}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  onTogglePerson={toggleItemPerson}
                  onAddSubItem={addSubItem}
                  onRemoveSubItem={removeSubItem}
                  onUpdateSubItem={updateSubItem}
                />
              ))}

              <button
                type="button"
                onClick={addItem}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold transition-colors hover:bg-white/[0.04]"
              >
                <Plus className="size-4" />
                Add Item
              </button>

              <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4">
                <span className="text-sm text-muted-foreground">Total</span>

                <span className="text-sm font-bold">
                  RM {totalAmount.toFixed(2)}
                </span>
              </div>
            </section>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Save */}
          <div className="mt-6">
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={handleSave}
              className="h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white shadow-sm transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white/60"
            >
              {saving ? "Saving..." : "Save Expense"}
            </button>
          </div>

          {showReceiptScanner && (
            <ReceiptImportDialog
              onClose={() => setShowReceiptScanner(false)}
              onImport={importReceiptDraft}
            />
          )}
        </>
      )}
    </div>
  );
}
