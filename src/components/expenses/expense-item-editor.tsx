"use client";

import { Plus, Trash2, X } from "lucide-react";

import type { Person } from "./expense-people-selector";

export type SubItem = {
  id: string;
  name: string;
  amount: string;
};

export type ExpenseItem = {
  id: string;
  name: string;
  amount: string;
  people: string[];
  subItems: SubItem[];
};

type ExpenseItemEditorProps = {
  item: ExpenseItem;
  people: Person[];
  onUpdate: (itemId: string, field: "name" | "amount", value: string) => void;
  onRemove: (itemId: string) => void;
  onTogglePerson: (itemId: string, personId: string) => void;
  onAddSubItem: (itemId: string) => void;
  onRemoveSubItem: (itemId: string, subItemId: string) => void;
  onUpdateSubItem: (
    itemId: string,
    subItemId: string,
    field: "name" | "amount",
    value: string,
  ) => void;
};

function getItemTotal(item: ExpenseItem) {
  const mainAmount = Number(item.amount) || 0;

  const addOnsTotal = item.subItems.reduce(
    (total, subItem) => total + (Number(subItem.amount) || 0),
    0,
  );

  return mainAmount + addOnsTotal;
}

export function ExpenseItemEditor({
  item,
  people,
  onUpdate,
  onRemove,
  onTogglePerson,
  onAddSubItem,
  onRemoveSubItem,
  onUpdateSubItem,
}: ExpenseItemEditorProps) {
  const itemTotal = getItemTotal(item);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {/* Main item */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={item.name}
            onChange={(event) => onUpdate(item.id, "name", event.target.value)}
            placeholder="Item name"
            className="w-full bg-transparent text-[15px] font-bold outline-none placeholder:text-muted-foreground"
          />

          <div className="mt-2 flex w-fit items-center gap-1 border-b border-border">
            <span className="text-xs text-muted-foreground">RM</span>

            <input
              value={item.amount}
              onChange={(event) =>
                onUpdate(item.id, "amount", event.target.value)
              }
              placeholder="0.00"
              inputMode="decimal"
              className="w-20 bg-transparent py-1 text-sm font-medium outline-none placeholder:text-muted-foreground"
              type="number"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.name || "item"}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* People sharing item */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Shared by
        </p>

        <div className="flex flex-wrap gap-1.5">
          {people.map((person) => {
            const active = item.people.includes(person.id);

            return (
              <button
                key={person.id}
                type="button"
                onClick={() => onTogglePerson(item.id, person.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1]"
                }`}
              >
                {person.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add-ons */}
      {item.subItems.length > 0 && (
        <div className="mt-4 border-l-2 border-blue-500/30 pl-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Add-ons
          </p>

          <div className="space-y-2">
            {item.subItems.map((subItem) => (
              <div
                key={subItem.id}
                className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2"
              >
                <input
                  value={subItem.name}
                  onChange={(event) =>
                    onUpdateSubItem(
                      item.id,
                      subItem.id,
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Add-on name"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />

                <div className="flex shrink-0 items-center border-b border-border">
                  <span className="text-xs text-muted-foreground">RM</span>

                  <input
                    value={subItem.amount}
                    onChange={(event) =>
                      onUpdateSubItem(
                        item.id,
                        subItem.id,
                        "amount",
                        event.target.value,
                      )
                    }
                    placeholder="0.00"
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-16 bg-transparent py-1 text-right text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveSubItem(item.id, subItem.id)}
                  aria-label="Remove add-on"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add add-on */}
      <button
        type="button"
        onClick={() => onAddSubItem(item.id)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/[0.1] hover:text-foreground"
      >
        <Plus className="size-4" />
        Add Add-on
      </button>

      {/* Total */}
      <div className="mt-3 flex justify-end text-xs text-muted-foreground">
        Item total:
        <span className="ml-1 font-bold text-foreground">
          RM {itemTotal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
