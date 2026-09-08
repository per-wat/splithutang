import { redirect } from "next/navigation";

import { PeopleHeader } from "@/components/people/people-header";
import {
  PeopleList,
  type PersonWithBalance,
} from "@/components/people/people-list";

import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PeoplePage() {
  const supabase = await createClient();

  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: people, error } = await supabase.rpc("get_people_balances");

  if (error) {
    console.error("Failed to load people balances:", error);

    return (
      <>
        <PeopleHeader />

        <div className="px-5 pt-8">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-medium text-red-400">Unable to load people</p>

            <p className="mt-1 text-sm text-muted-foreground">
              Please try again later.
            </p>
          </div>
        </div>
      </>
    );
  }

  const visiblePeople: PersonWithBalance[] = (people ?? []).map((person) => {
    return {
      id: person.person_id,

      name: person.name,

      balance: Number(person.balance ?? 0),

      avatarColor: person.avatar_color ?? "bg-blue-600",

      avatarPath: person.avatar_path ?? null,
    };
  });

  return (
    <>
      <PeopleHeader />
      <PeopleList people={visiblePeople} />
    </>
  );
}
