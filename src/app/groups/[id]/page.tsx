import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import {
  GroupMemberManager,
  type GroupCandidateView,
  type GroupMemberView,
} from "@/components/groups/group-member-manager";
import {
  GroupInviteManager,
  type GroupInviteView,
  type LocalGroupMemberOption,
} from "@/components/groups/group-invite-manager";
import { GroupSettingsForm } from "@/components/groups/group-settings-form";
import { getPersonDisplayName } from "@/lib/person-display-name";
import { createClient } from "@/lib/supabase/server";

type GroupDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const fallbackColors = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-orange-600",
  "bg-emerald-600",
  "bg-cyan-600",
];

export default async function GroupDetailPage({
  params,
}: GroupDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
   * Group
   */
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select(
      `
        id,
        name,
        owner_id,
        allow_debtor_self_confirm
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (groupError || !group) {
    notFound();
  }

  /*
   * Memberships
   */
  const { data: memberships, error: membershipError } = await supabase
    .from("group_members")
    .select(
      `
        person_id,
        role,
        created_at
      `,
    )
    .eq("group_id", group.id)
    .order("created_at");

  if (membershipError) {
    console.error("Unable to load group members:", membershipError);

    throw new Error("Unable to load group members");
  }

  const memberIds = (memberships ?? []).map(
    (membership) => membership.person_id,
  );

  /*
   * Member people
   */
  const memberPeopleResult =
    memberIds.length > 0
      ? await supabase
          .from("people")
          .select(
            `
              id,
              name,
              avatar_color,
              linked_user_id
            `,
          )
          .in("id", memberIds)
      : {
          data: [],
          error: null,
        };

  if (memberPeopleResult.error) {
    console.error(
      "Unable to load group member people:",
      memberPeopleResult.error,
    );

    throw new Error("Unable to load group members");
  }

  /*
   * All people currently visible to this user.
   *
   * Owner can reuse these people in this group.
   */
  const { data: visiblePeople, error: visiblePeopleError } = await supabase
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

  if (visiblePeopleError) {
    console.error("Unable to load available people:", visiblePeopleError);

    throw new Error("Unable to load available people");
  }

  const memberPeopleById = new Map(
    (memberPeopleResult.data ?? []).map((person) => [person.id, person]),
  );

  /*
   * UI members
   */
  const members = (memberships ?? [])
    .map((membership, index): GroupMemberView | null => {
      const person = memberPeopleById.get(membership.person_id);

      if (!person) {
        return null;
      }

      return {
        id: person.id,

        name: getPersonDisplayName(person, user.id),

        initial: person.name.trim().charAt(0).toUpperCase() || "?",

        color:
          person.avatar_color ?? fallbackColors[index % fallbackColors.length],

        role: membership.role,

        isSelf: person.linked_user_id === user.id,

        isLinked: person.linked_user_id !== null,
      };
    })
    .filter((member): member is GroupMemberView => member !== null);

  /*
   * People not already in this group.
   */
  const memberIdSet = new Set(memberIds);

  const candidates: GroupCandidateView[] = (visiblePeople ?? [])
    .filter(
      (person) =>
        !memberIdSet.has(person.id) && person.linked_user_id !== user.id,
    )
    .map((person) => ({
      id: person.id,

      name: person.name,
    }));

  const isOwner = group.owner_id === user.id;
  /*
   * ------------------------------------------
   * Group invitations
   * ------------------------------------------
   */

  let invites: GroupInviteView[] = [];

  if (isOwner) {
    const { data: inviteRows, error: inviteError } = await supabase.rpc(
      "get_group_invites",
      {
        p_group_id: group.id,
      },
    );

    if (inviteError) {
      console.error("Unable to load group invitations:", inviteError);

      throw new Error("Unable to load group invitations");
    }

    invites = (inviteRows ?? []).map((invite) => ({
      inviteId: invite.invite_id,

      personId: invite.person_id,

      personName: invite.person_name,

      email: invite.email,

      token: invite.token,

      status: invite.status,

      expiresAt: invite.expires_at,

      acceptedAt: invite.accepted_at,

      claimedPersonId: invite.claimed_person_id,
    }));
  }

  const localInviteMembers: LocalGroupMemberOption[] = members
    .filter((member) => member.role === "member" && !member.isLinked)
    .map((member) => ({
      id: member.id,

      name: member.name,
    }));

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        {/* Header */}
        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <Link
            href="/groups"
            aria-label="Back to groups"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{group.name}</h1>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {members.length} {members.length === 1 ? "member" : "members"}
            </p>
          </div>

          {isOwner && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-blue-600/10 px-2.5 py-1 text-xs font-semibold text-blue-400">
              <ShieldCheck className="size-3.5" />
              Owner
            </div>
          )}
        </header>

        {/* Confirmation setting summary */}
        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Payment Confirmation
          </p>

          <p className="mt-2 text-sm">
            Debtor self-confirm is{" "}
            <span
              className={`font-semibold ${
                group.allow_debtor_self_confirm ? "text-emerald-400" : ""
              }`}
            >
              {group.allow_debtor_self_confirm ? "enabled" : "disabled"}
            </span>
          </p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {group.allow_debtor_self_confirm
              ? "Members can confirm their own payments immediately."
              : "Payments submitted by a debtor require confirmation from the receiver."}
          </p>
        </section>

        {/* Members */}
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Members
          </h2>

          <GroupMemberManager
            groupId={group.id}
            members={members}
            candidates={candidates}
            isOwner={isOwner}
          />
        </section>

        {isOwner && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Invitations
            </h2>

            <GroupInviteManager
              groupId={group.id}
              localMembers={localInviteMembers}
              invites={invites}
            />
          </section>
        )}

        {/* Owner settings */}
        {isOwner && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Group Settings
            </h2>

            <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
              <GroupSettingsForm
                groupId={group.id}
                initialName={group.name}
                initialAllowDebtorSelfConfirm={group.allow_debtor_self_confirm}
              />
            </div>
          </section>
        )}

        {!isOwner && (
          <div className="mt-7 rounded-2xl border border-white/[0.08] bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Only the group owner can manage members and group settings.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
