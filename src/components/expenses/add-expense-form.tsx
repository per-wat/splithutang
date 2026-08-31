"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  ExpenseItemEditor,
  type ExpenseItem,
  type SubItem,
} from "./expense-item-editor";

import { ExpensePeopleSelector, type Person } from "./expense-people-selector";

const people: Person[] = [
  {
    id: "you",
    name: "You",
    initial: "Y",
    color: "bg-blue-600",
  },
  {
    id: "ahmad",
    name: "Ahmad",
    initial: "A",
    color: "bg-purple-600",
  },
  {
    id: "sarah",
    name: "Sarah",
    initial: "S",
    color: "bg-pink-600",
  },
  {
    id: "raj",
    name: "Raj",
    initial: "R",
    color: "bg-orange-600",
  },
  {
    id: "lisa",
    name: "Lisa",
    initial: "L",
    color: "bg-emerald-600",
  },
];

type SplitMethod = "equal" | "amount" | "items";

const createId = () => crypto.randomUUID();

const createEmptyItem = (selectedPeople: string[]): ExpenseItem => ({
  id: createId(),
  name: "",
  amount: "",
  people: [...selectedPeople],
  subItems: [],
});

export function AddExpenseForm() {
  const router = useRouter();

  const [expenseName, setExpenseName] = useState("");

  const [date, setDate] = useState("30/08/2026");

  const [paidBy, setPaidBy] = useState("you");

  const [selectedPeople, setSelectedPeople] = useState<string[]>(
    people.map((person) => person.id),
  );

  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");

  const [totalExpense, setTotalExpense] = useState("");

  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(people.map((person) => [person.id, "0.00"])),
  );

  const [items, setItems] = useState<ExpenseItem[]>([
    createEmptyItem(selectedPeople),
  ]);

  /*
   * ------------------------------------------
   * Calculations
   * ------------------------------------------
   */

  const itemsTotal = useMemo(() => {
    return items.reduce((total, item) => {
      const mainAmount = Number(item.amount) || 0;

      const addOnsTotal = item.subItems.reduce(
        (sum, subItem) => sum + (Number(subItem.amount) || 0),
        0,
      );

      return total + mainAmount + addOnsTotal;
    }, 0);
  }, [items]);

  const amountSplitTotal = useMemo(() => {
    return Object.values(amounts).reduce(
      (total, amount) => total + (Number(amount) || 0),
      0,
    );
  }, [amounts]);

  const totalAmount = useMemo(() => {
    if (splitMethod === "items") {
      return itemsTotal;
    }

    if (splitMethod === "amount") {
      return amountSplitTotal;
    }

    return Number(totalExpense) || 0;
  }, [splitMethod, totalExpense, itemsTotal, amountSplitTotal]);

  const equalAmount = useMemo(() => {
    if (selectedPeople.length === 0) {
      return 0;
    }

    return totalAmount / selectedPeople.length;
  }, [selectedPeople.length, totalAmount]);

  /*
   * ------------------------------------------
   * People
   * ------------------------------------------
   */

  const togglePerson = (personId: string) => {
    setSelectedPeople((current) => {
      const next = current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId];

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
    field: "name" | "amount",
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
    field: keyof Pick<SubItem, "name" | "amount">,
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

  const hasValidSplit = totalAmount > 0;

  const canSave = hasValidBasicInfo && hasValidSplit;

  /*
   * ------------------------------------------
   * Save
   * ------------------------------------------
   */

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    const expense = {
      name: expenseName.trim(),
      date,
      paidBy,
      people: selectedPeople,
      splitMethod,
      totalAmount,
      amounts: splitMethod === "amount" ? amounts : undefined,
      items: splitMethod === "items" ? items : undefined,
    };

    /*
     * Temporary:
     * We'll replace this with Supabase
     * later.
     */
    console.log("Expense:", expense);

    router.push("/expenses");
  };

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

      {/* Basic information */}
      <section className="mt-3">
        <h2 className="mb-4 text-sm font-bold">Basic Information</h2>

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
              type="text"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Paid by */}
      <section className="mt-7">
        <h2 className="mb-3 text-sm font-bold">Paid By</h2>

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
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-sm font-bold text-white ${person.color}`}
                >
                  {person.initial}
                </span>

                <span className="text-sm font-medium">{person.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Who is involved */}
      <section className="mt-7">
        <h2 className="mb-3 text-sm font-bold">With Who?</h2>

        <ExpensePeopleSelector
          people={people}
          selectedPeople={selectedPeople}
          onToggle={togglePerson}
          personPaying={paidBy}
        />
      </section>

      {/* Split method */}
      <section className="mt-7">
        <h2 className="mb-3 text-sm font-bold">How to Split</h2>

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
                    index !== list.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-9 items-center justify-center rounded-full text-sm font-bold text-white ${person.color}`}
                    >
                      {person.initial}
                    </span>

                    <span className="text-sm font-semibold">{person.name}</span>
                  </div>

                  <span className="font-bold">RM {equalAmount.toFixed(2)}</span>
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
                  <span
                    className={`flex size-9 items-center justify-center rounded-full text-sm font-bold text-white ${person.color}`}
                  >
                    {person.initial}
                  </span>

                  <span className="text-sm font-semibold">{person.name}</span>
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
          {items.map((item) => (
            <ExpenseItemEditor
              key={item.id}
              item={item}
              people={people}
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

      {/* Save */}
      <div className="mt-6">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white shadow-sm transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white/60"
        >
          Save Expense
        </button>
      </div>
    </div>
  );
}
