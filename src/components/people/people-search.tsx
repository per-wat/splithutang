"use client";

import { Search } from "lucide-react";

type PeopleSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PeopleSearch({ value, onChange }: PeopleSearchProps) {
  return (
    <section className="px-5 pt-6">
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4">
        <Search className="size-5 shrink-0 text-muted-foreground" />

        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search people..."
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </section>
  );
}
