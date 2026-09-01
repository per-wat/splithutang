"use client";

import { Check } from "lucide-react";

export type Person = {
  id: string;
  name: string;
  initial: string;
  color: string;
  isSelf: boolean;
};

type ExpensePeopleSelectorProps = {
  people: Person[];
  selectedPeople: string[];
  onToggle: (personId: string) => void;
  personPaying: string;
};

export function ExpensePeopleSelector({
  people,
  selectedPeople,
  onToggle,
  personPaying,
}: ExpensePeopleSelectorProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {people.map((person, index) => {
        const selected = selectedPeople.includes(person.id);

        return (
          <button
            key={person.id}
            type="button"
            onClick={() => onToggle(person.id)}
            className={`flex w-full items-center justify-between px-4 py-3.5 transition-colors ${
              index !== people.length - 1 ? "border-b border-border" : ""
            } hover:bg-white/[0.03]`}
            disabled={person.id === personPaying}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex size-9 items-center justify-center rounded-full text-sm font-bold text-white ${person.color}`}
              >
                {person.initial}
              </span>

              <span className="text-sm font-semibold">{person.name}</span>
              {person.id === personPaying && (
                <span className="text-sm font-medium text-muted-foreground">
                  is paying
                </span>
              )}
            </div>

            <span
              className={`flex size-6 items-center justify-center rounded-full transition-colors ${
                selected
                  ? "bg-blue-600 text-white"
                  : "border border-border bg-transparent"
              }`}
            >
              {selected && (
                <Check
                  className="size-4"
                  strokeWidth={3}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
