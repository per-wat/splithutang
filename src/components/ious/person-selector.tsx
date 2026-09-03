"use client";

import { ProfileAvatar } from "@/components/profile/profile-avatar";

export type Person = {
  id: string;
  name: string;
  initial: string;
  color: string;

  avatarPath: string | null;
};

type PersonSelectorProps = {
  people: Person[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function PersonSelector({
  people,
  selectedId,
  onSelect,
}: PersonSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((person) => {
        const isSelected = selectedId === person.id;

        return (
          <button
            key={person.id}
            type="button"
            onClick={() => onSelect(person.id)}
            className={`flex items-center gap-2 rounded-2xl border px-2 py-1.5 pr-3 transition-colors ${
              isSelected
                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                : "border-white/[0.08] bg-white/[0.03] text-foreground hover:bg-white/[0.06]"
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
  );
}
