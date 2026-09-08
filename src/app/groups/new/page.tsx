import { redirect } from "next/navigation";

import {
  CreateGroupForm,
  type GroupPersonOption,
} from "@/components/groups/create-group-form";
import { getVerifiedUser } from "@/lib/supabase/auth";
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

  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: people, error } = await supabase.rpc(
    "get_group_member_candidates",
  );

  if (error) {
    console.error("Unable to load people:", error);

    throw new Error("Unable to load people");
  }

  const options: GroupPersonOption[] = (people ?? []).map((person, index) => ({
    id: person.person_id,

    name: person.name,

    initial: person.name.trim().charAt(0).toUpperCase() || "?",

    color:
      person.avatar_color ?? fallbackColors[index % fallbackColors.length],
  }));

  return <CreateGroupForm people={options} />;
}
