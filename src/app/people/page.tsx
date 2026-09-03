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

  const personIds = (people ?? []).map((person) => person.person_id);

  const { data: avatarPeople, error: avatarError } =
    personIds.length > 0
      ? await supabase
          .from("people")
          .select(
            `
            id,
            avatar_color,
            avatar_path
          `,
          )
          .in("id", personIds)
      : {
          data: [],
          error: null,
        };

  if (avatarError) {
    console.error("Unable to load person avatars:", avatarError);
  }

  const avatarByPersonId = new Map(
    (avatarPeople ?? []).map((person) => [person.id, person]),
  );

  const visiblePeople: PersonWithBalance[] = (people ?? []).map((person) => {
    const avatar = avatarByPersonId.get(person.person_id);

    return {
      id: person.person_id,

      name: person.name,

      balance: Number(person.balance ?? 0),

      avatarColor: avatar?.avatar_color ?? "bg-blue-600",

      avatarPath: avatar?.avatar_path ?? null,
    };
  });

  return (
    <AppShell>
      <PeopleHeader />
      <PeopleList people={visiblePeople} />
    </AppShell>
  );
}
