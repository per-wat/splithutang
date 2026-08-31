"use client";

import { useMemo, useState } from "react";

import { PeopleHeader } from "@/components/people/people-header";
import { PeopleSearch } from "@/components/people/people-search";
import { PersonCard } from "@/components/people/person-card";
import { AppShell } from "@/components/layout/app-shell";

const people = [
  {
    id: 1,
    name: "Ahmad",
    balance: 41.66,
  },
  {
    id: 2,
    name: "Sarah",
    balance: -17,
  },
  {
    id: 3,
    name: "Raj",
    balance: 65,
  },
  {
    id: 4,
    name: "Daniel",
    balance: 0,
  },
  {
    id: 5,
    name: "Aisyah",
    balance: -32.5,
  },
];

export default function PeoplePage() {
  const [search, setSearch] = useState("");

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return people;
    }

    return people.filter((person) => person.name.toLowerCase().includes(query));
  }, [search]);

  return (
    <AppShell>
      <PeopleHeader />

      <PeopleSearch
        value={search}
        onChange={setSearch}
      />

      <section className="px-5 pb-8 pt-7">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Your People
        </h2>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          {filteredPeople.length > 0 ? (
            filteredPeople.map((person, index) => (
              <div
                key={person.id}
                className={
                  index !== filteredPeople.length - 1
                    ? "border-b border-white/[0.06]"
                    : ""
                }
              >
                <PersonCard
                  name={person.name}
                  balance={person.balance}
                />
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="font-medium">No people found</p>

              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search.
              </p>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
