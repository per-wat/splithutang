"use client";

import { Archive, LogOut, RotateCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type OwnershipCandidate = {
  id: string;
  name: string;
};

type GroupLifecycleActionsProps = {
  groupId: string;

  isOwner: boolean;

  isArchived: boolean;

  currentUserIsActiveMember: boolean;

  ownershipCandidates: OwnershipCandidate[];
};

export function GroupLifecycleActions({
  groupId,
  isOwner,
  isArchived,
  currentUserIsActiveMember,
  ownershipCandidates,
}: GroupLifecycleActionsProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [selectedOwnerId, setSelectedOwnerId] = useState(
    ownershipCandidates[0]?.id ?? "",
  );

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  async function archiveGroup() {
    if (saving) {
      return;
    }

    const confirmed = window.confirm(
      "Archive this group? Existing expenses, IOUs and payments will remain available, but no new transactions can be created until the group is restored.",
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("archive_group", {
      p_group_id: groupId,
    });

    if (error) {
      setError(error.message);

      setSaving(false);
      return;
    }

    setSaving(false);

    router.refresh();
  }

  async function restoreGroup() {
    if (saving) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("unarchive_group", {
      p_group_id: groupId,
    });

    if (error) {
      setError(error.message);

      setSaving(false);
      return;
    }

    setSaving(false);

    router.refresh();
  }

  async function leaveGroup() {
    if (saving) {
      return;
    }

    const confirmed = window.confirm(
      "Leave this group? You will keep access to your historical expenses and IOUs, but you will no longer be an active member.",
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("leave_group", {
      p_group_id: groupId,
    });

    if (error) {
      setError(error.message);

      setSaving(false);
      return;
    }

    router.push("/groups");

    router.refresh();
  }

  async function transferOwnership() {
    if (!selectedOwnerId || saving) {
      return;
    }

    const candidate = ownershipCandidates.find(
      (person) => person.id === selectedOwnerId,
    );

    const confirmed = window.confirm(
      `Transfer ownership to ${
        candidate?.name ?? "this member"
      }? You will become a normal group member.`,
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("transfer_group_ownership", {
      p_group_id: groupId,

      p_new_owner_person_id: selectedOwnerId,
    });

    if (error) {
      setError(error.message);

      setSaving(false);
      return;
    }

    setSaving(false);

    router.refresh();
  }

  return (
    <div className="space-y-4">
      {isOwner ? (
        <>
          {/* Archive / Restore */}
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div className="flex items-start gap-3">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                  isArchived ? "bg-emerald-500/10" : "bg-amber-500/10"
                }`}
              >
                {isArchived ? (
                  <RotateCcw className="size-4 text-emerald-400" />
                ) : (
                  <Archive className="size-4 text-amber-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {isArchived ? "Restore Group" : "Archive Group"}
                </p>

                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {isArchived
                    ? "Restore this group to allow new expenses, IOUs, members and invitations."
                    : "Archiving stops new activity while preserving all financial history and repayments."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={isArchived ? restoreGroup : archiveGroup}
              disabled={saving}
              className={`mt-4 h-11 w-full rounded-xl text-sm font-semibold disabled:opacity-50 ${
                isArchived
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {saving
                ? "Please wait..."
                : isArchived
                  ? "Restore Group"
                  : "Archive Group"}
            </button>
          </div>

          {/* Transfer ownership */}
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10">
                <ShieldCheck className="size-4 text-blue-400" />
              </div>

              <div>
                <p className="text-sm font-semibold">Transfer Ownership</p>

                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Ownership can only be transferred to an active member with a
                  SplitHutang account.
                </p>
              </div>
            </div>

            {ownershipCandidates.length > 0 ? (
              <>
                <select
                  value={selectedOwnerId}
                  onChange={(event) => setSelectedOwnerId(event.target.value)}
                  className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-blue-500"
                >
                  {ownershipCandidates.map((person) => (
                    <option
                      key={person.id}
                      value={person.id}
                    >
                      {person.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={transferOwnership}
                  disabled={saving || !selectedOwnerId}
                  className="mt-3 h-11 w-full rounded-xl bg-blue-600/10 text-sm font-semibold text-blue-400 disabled:opacity-50"
                >
                  Transfer Ownership
                </button>
              </>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                There are no other active account members available for
                ownership transfer.
              </p>
            )}
          </div>
        </>
      ) : (
        currentUserIsActiveMember && (
          <div className="rounded-2xl border border-red-500/10 bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
                <LogOut className="size-4 text-red-400" />
              </div>

              <div>
                <p className="text-sm font-semibold">Leave Group</p>

                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  You can leave once all money involving you in this group has
                  been settled.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={leaveGroup}
              disabled={saving}
              className="mt-4 h-11 w-full rounded-xl bg-red-500/10 text-sm font-semibold text-red-400 disabled:opacity-50"
            >
              Leave Group
            </button>
          </div>
        )
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
