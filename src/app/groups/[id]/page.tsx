import Link from "next/link";
import { Archive, ArrowLeft, ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import {
  GroupInviteManager,
  type GroupInviteView,
  type LocalGroupMemberOption,
} from "@/components/groups/group-invite-manager";
import {
  GroupLifecycleActions,
  type OwnershipCandidate,
} from "@/components/groups/group-lifecycle-actions";
import {
  GroupMemberManager,
  type GroupCandidateView,
  type GroupMemberView,
} from "@/components/groups/group-member-manager";
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
        allow_debtor_self_confirm,
        archived_at
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (groupError || !group) {
    notFound();
  }

  const isOwner = group.owner_id === user.id;

  const isArchived = Boolean(group.archived_at);

  /*
   * Memberships
   *
   * Lifecycle means we keep old rows.
   */
  const { data: memberships, error: membershipError } = await supabase
    .from("group_members")
    .select(
      `
        person_id,
        role,
        membership_status,
        created_at,
        ended_at
      `,
    )
    .eq("group_id", group.id)
    .order("created_at");

  if (membershipError) {
    console.error("Unable to load group members:", membershipError);

    throw new Error("Unable to load group members");
  }

  const allMemberIds = [
    ...new Set((memberships ?? []).map((membership) => membership.person_id)),
  ];

  const memberPeopleResult =
    allMemberIds.length > 0
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
          .in("id", allMemberIds)
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

  const memberPeopleById = new Map(
    (memberPeopleResult.data ?? []).map((person) => [person.id, person]),
  );

  /*
   * Active memberships only.
   */
  const activeMemberships = (memberships ?? []).filter(
    (membership) => membership.membership_status === "active",
  );

  const inactiveMemberships = (memberships ?? []).filter(
    (membership) => membership.membership_status !== "active",
  );

  const activeMemberIds = activeMemberships.map(
    (membership) => membership.person_id,
  );

  const activeMemberIdSet = new Set(activeMemberIds);

  /*
   * Main member list.
   */
  const members = activeMemberships
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
   * Former members.
   */
  const formerMembers = inactiveMemberships
    .map((membership) => {
      const person = memberPeopleById.get(membership.person_id);

      if (!person) {
        return null;
      }

      return {
        id: person.id,

        name: getPersonDisplayName(person, user.id),

        status: membership.membership_status,
      };
    })
    .filter(
      (
        member,
      ): member is {
        id: string;
        name: string;
        status: "left" | "removed";
      } => member !== null && member.status !== "active",
    );

  /*
   * Is current user active?
   */
  const currentUserPerson = (memberPeopleResult.data ?? []).find(
    (person) => person.linked_user_id === user.id,
  );

  const currentUserMembership = currentUserPerson
    ? (memberships ?? []).find(
        (membership) => membership.person_id === currentUserPerson.id,
      )
    : undefined;

  const currentUserIsActiveMember =
    currentUserMembership?.membership_status === "active";

  /*
   * All people visible to current user.
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

  /*
   * Anybody who is NOT currently
   * active may be re-added.
   *
   * This intentionally includes
   * former members.
   */
  const candidates: GroupCandidateView[] = (visiblePeople ?? [])
    .filter(
      (person) =>
        !activeMemberIdSet.has(person.id) && person.linked_user_id !== user.id,
    )
    .map((person) => ({
      id: person.id,

      name: person.name,
    }));

  /*
   * Transfer ownership:
   *
   * active + linked account +
   * not current user.
   */
  const ownershipCandidates: OwnershipCandidate[] = activeMemberships
    .map((membership) => {
      const person = memberPeopleById.get(membership.person_id);

      if (
        !person ||
        !person.linked_user_id ||
        person.linked_user_id === user.id
      ) {
        return null;
      }

      return {
        id: person.id,

        name: person.name,
      };
    })
    .filter((person): person is OwnershipCandidate => person !== null);

  /*
   * Invitations
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
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold">{group.name}</h1>

              {isArchived && (
                <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Archived
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {members.length}{" "}
              {members.length === 1 ? "active member" : "active members"}
            </p>
          </div>

          {isOwner && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-blue-600/10 px-2.5 py-1 text-xs font-semibold text-blue-400">
              <ShieldCheck className="size-3.5" />
              Owner
            </div>
          )}
        </header>

        {/* Archived notice */}
        {isArchived && (
          <section className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
            <div className="flex gap-3">
              <Archive className="mt-0.5 size-5 shrink-0 text-amber-400" />

              <div>
                <p className="text-sm font-semibold text-amber-400">
                  Archived Group
                </p>

                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Existing expenses, IOUs and repayments remain available. New
                  activity is disabled until this group is restored.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Payment setting */}
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

        {/* Active Members */}
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Active Members
          </h2>

          <GroupMemberManager
            groupId={group.id}
            members={members}
            candidates={candidates}
            isOwner={isOwner}
            isArchived={isArchived}
          />
        </section>

        {/* Former Members */}
        {formerMembers.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Former Members
            </h2>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {formerMembers.map((member, index) => (
                <div
                  key={member.id}
                  className={`flex items-center justify-between gap-3 px-4 py-4 ${
                    index !== formerMembers.length - 1
                      ? "border-b border-white/[0.06]"
                      : ""
                  }`}
                >
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {member.name}
                  </p>

                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
                    {member.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Invitations */}
        {isOwner && (
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Invitations
            </h2>

            <GroupInviteManager
              groupId={group.id}
              localMembers={localInviteMembers}
              invites={invites}
              isArchived={isArchived}
            />
          </section>
        )}

        {/* Settings */}
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

        {/* Lifecycle */}
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Group Lifecycle
          </h2>

          <GroupLifecycleActions
            groupId={group.id}
            isOwner={isOwner}
            isArchived={isArchived}
            currentUserIsActiveMember={currentUserIsActiveMember}
            ownershipCandidates={ownershipCandidates}
          />
        </section>

        {!isOwner && currentUserIsActiveMember && (
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
