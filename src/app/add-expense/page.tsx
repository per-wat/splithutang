import { redirect } from "next/navigation";

import {
  AddExpenseForm,
  type ExpenseGroupOption,
} from "@/components/expenses/add-expense-form";

import { createClient } from "@/lib/supabase/server";

const fallbackColors = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-orange-600",
  "bg-emerald-600",
  "bg-cyan-600",
];

export default async function AddExpensePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select(
      `
      id,
      name
    `,
    )
    .is("archived_at", null)
    .order("name");

  if (groupsError) {
    console.error("Unable to load groups:", groupsError);
  }

  const groupIds = (groups ?? []).map((group) => group.id);

  const { data: memberships, error: membershipError } =
    groupIds.length > 0
      ? await supabase
          .from("group_members")
          .select(
            `
              group_id,
              person_id
            `,
          )
          .in("group_id", groupIds)
          .eq("membership_status", "active")
      : { data: [], error: null };

  if (membershipError) {
    console.error("Unable to load group members:", membershipError);
  }

  const personIds = [
    ...new Set((memberships ?? []).map((membership) => membership.person_id)),
  ];

  const { data: people, error: peopleError } =
    personIds.length > 0
      ? await supabase
          .from("people")
          .select("id, name, avatar_color, avatar_path, linked_user_id")
          .in("id", personIds)
      : { data: [], error: null };

  if (peopleError) {
    console.error("Unable to load people:", peopleError);
  }

  const peopleById = new Map(
    (people ?? []).map((person, index) => {
      const isSelf = person.linked_user_id === user.id;

      return [
        person.id,
        {
          id: person.id,

          // "You" is only a UI label.
          // The actual database name remains unchanged.
          name: isSelf ? "You" : person.name,

          initial: person.name.trim().charAt(0).toUpperCase() || "?",

          color:
            person.avatar_color ??
            fallbackColors[index % fallbackColors.length],

          isSelf,

          avatarPath: person.avatar_path,
        },
      ];
    }),
  );

  const groupOptions: ExpenseGroupOption[] = (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,

    people: (memberships ?? [])
      .filter((membership) => membership.group_id === group.id)
      .map((membership) => peopleById.get(membership.person_id))
      .filter((person): person is NonNullable<typeof person> =>
        Boolean(person),
      ),
  }));

  return <AddExpenseForm groups={groupOptions} />;
}
