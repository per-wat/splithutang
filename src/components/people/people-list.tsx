"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PeopleSearch } from "@/components/people/people-search";
import { PersonCard } from "@/components/people/person-card";

export type PersonWithBalance = {
  id: string;
  name: string;
  balance: number;
};

type PeopleListProps = {
  people: PersonWithBalance[];
};

export function PeopleList({ people }: PeopleListProps) {
  const [search, setSearch] = useState("");

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return people;
    }

    return people.filter((person) => person.name.toLowerCase().includes(query));
  }, [people, search]);

  return (
    <>
      <PeopleSearch
        value={search}
        onChange={setSearch}
      />

      <section className="px-5 pb-8 pt-7">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Your People
        </h2>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          {filteredPeople.map((person, index) => (
            <div
              key={person.id}
              className={
                index !== filteredPeople.length - 1
                  ? "border-b border-white/[0.06]"
                  : ""
              }
            >
              <Link
                href={`/people/${person.id}`}
                className="block transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
              >
                <PersonCard
                  name={person.name}
                  balance={person.balance}
                />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
