"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { UsersRound } from "lucide-react";

import { PeopleSearch } from "@/components/people/people-search";
import { PersonCard } from "@/components/people/person-card";

export type PersonWithBalance = {
  id: string;
  name: string;
  balance: number;

  avatarColor: string;

  avatarPath: string | null;
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
        {filteredPeople.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card p-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-600/10">
              <UsersRound className="size-5 text-blue-400" />
            </div>

            <p className="mt-4 font-semibold">No new friends</p>

            <p className="mt-1 text-sm text-muted-foreground">
              Create a group first to add new friends and start splitting.
            </p>

            <Link
              href="/groups/new"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
            >
              Create Group
            </Link>
          </div>
        ) : (
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
                    avatarColor={person.avatarColor}
                    avatarPath={person.avatarPath}
                  />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
