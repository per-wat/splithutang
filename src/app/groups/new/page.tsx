import { redirect } from "next/navigation";

import {
  CreateGroupForm,
  type GroupPersonOption,
} from "@/components/groups/create-group-form";
import { createClient } from "@/lib/supabase/server";

const fallbackColors = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-orange-600",
  "bg-emerald-600",
  "bg-cyan-600",
];

export default async function NewGroupPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: people, error } = await supabase
    .from("people")
    .select(
      `
        id,
        name,
        avatar_color,
        linked_user_id
      `,
    )
    .order("name");

  if (error) {
    console.error("Unable to load people:", error);

    throw new Error("Unable to load people");
  }

  const options: GroupPersonOption[] = (people ?? [])
    .filter((person) => person.linked_user_id !== user.id)
    .map((person, index) => ({
      id: person.id,

      name: person.name,

      initial: person.name.trim().charAt(0).toUpperCase() || "?",

      color:
        person.avatar_color ?? fallbackColors[index % fallbackColors.length],
    }));

  return <CreateGroupForm people={options} />;
}
