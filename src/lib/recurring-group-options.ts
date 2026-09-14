import "server-only";

import type { RecurringGroupOption } from "@/components/recurring/recurring-form";
import type { createClient } from "@/lib/supabase/server";

const colors = ["bg-blue-600", "bg-purple-600", "bg-pink-600", "bg-orange-600", "bg-emerald-600", "bg-cyan-600"];

export async function getRecurringGroupOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  if (groupsError) throw new Error("Unable to load groups");

  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: memberships, error: membershipsError } = groupIds.length
    ? await supabase
        .from("group_members")
        .select("group_id, person_id")
        .in("group_id", groupIds)
        .eq("membership_status", "active")
    : { data: [], error: null };
  if (membershipsError) throw new Error("Unable to load group members");

  const personIds = [...new Set((memberships ?? []).map((membership) => membership.person_id))];
  const { data: people, error: peopleError } = personIds.length
    ? await supabase
        .from("people")
        .select("id, name, avatar_color, linked_user_id")
        .in("id", personIds)
    : { data: [], error: null };
  if (peopleError) throw new Error("Unable to load people");

  const peopleById = new Map((people ?? []).map((person, index) => [person.id, {
    id: person.id,
    name: person.linked_user_id === userId ? "You" : person.name,
    color: person.avatar_color ?? colors[index % colors.length],
    isSelf: person.linked_user_id === userId,
  }]));

  return (groups ?? []).map((group): RecurringGroupOption => ({
    id: group.id,
    name: group.name,
    people: (memberships ?? [])
      .filter((membership) => membership.group_id === group.id)
      .flatMap((membership) => {
        const person = peopleById.get(membership.person_id);
        return person ? [person] : [];
      }),
  }));
}

