import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { PeopleHeader } from "@/components/people/people-header";
import {
  PeopleList,
  type PersonWithBalance,
} from "@/components/people/people-list";

import { createClient } from "@/lib/supabase/server";

export default async function PeoplePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: people, error } = await supabase.rpc("get_people_balances");

  if (error) {
    console.error("Failed to load people balances:", error);

    return (
      <AppShell>
        <PeopleHeader />

        <div className="px-5 pt-8">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-medium text-red-400">Unable to load people</p>

            <p className="mt-1 text-sm text-muted-foreground">
              Please try again later.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const visiblePeople: PersonWithBalance[] = (people ?? []).map((person) => ({
    id: person.person_id,
    name: person.name,
    balance: Number(person.balance ?? 0),
  }));

  return (
    <AppShell>
      <PeopleHeader />
      <PeopleList people={visiblePeople} />
    </AppShell>
  );
}
