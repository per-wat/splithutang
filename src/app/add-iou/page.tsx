import { redirect } from "next/navigation";

import { IouForm } from "@/components/ious/iou-form";
import { createClient } from "@/lib/supabase/server";

const avatarColors = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-orange-600",
  "bg-emerald-600",
  "bg-cyan-600",
  "bg-indigo-600",
];

export type IouGroupOption = {
  id: string;
  name: string;
  people: {
    id: string;
    name: string;
    initial: string;
    color: string;
    isSelf: boolean;
  }[];
};

export default async function AddIouPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select("id, name")
    .order("name");

  if (groupsError) {
    console.error("Unable to load groups:", groupsError);
  }

  const groupIds = (groups ?? []).map((group) => group.id);

  const { data: memberships, error: membershipError } =
    groupIds.length > 0
      ? await supabase
          .from("group_members")
          .select("group_id, person_id")
          .in("group_id", groupIds)
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
          .select("id, name, linked_user_id")
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

          color: avatarColors[index % avatarColors.length],

          isSelf,
        },
      ];
    }),
  );

  const groupOptions: IouGroupOption[] = (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,

    people: (memberships ?? [])
      .filter((membership) => membership.group_id === group.id)
      .map((membership) => peopleById.get(membership.person_id))
      .filter((person): person is NonNullable<typeof person> =>
        Boolean(person),
      ),
  }));

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <IouForm groups={groupOptions} />
    </main>
  );
}
