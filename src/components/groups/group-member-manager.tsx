"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type GroupMemberView = {
  id: string;
  name: string;
  initial: string;
  color: string;
  role: "owner" | "member";
  isSelf: boolean;
  isLinked: boolean;
};

export type GroupCandidateView = {
  id: string;
  name: string;
};

type GroupMemberManagerProps = {
  groupId: string;
  members: GroupMemberView[];
  candidates: GroupCandidateView[];
  isOwner: boolean;
};

export function GroupMemberManager({
  groupId,
  members,
  candidates,
  isOwner,
}: GroupMemberManagerProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");

  const [newName, setNewName] = useState("");

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  async function addExisting() {
    if (!candidateId || saving) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("add_group_member", {
      p_group_id: groupId,

      p_person_id: candidateId,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  async function createLocal() {
    const cleanName = newName.trim();

    if (!cleanName || saving) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("create_local_group_member", {
      p_group_id: groupId,

      p_name: cleanName,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setNewName("");
    setSaving(false);

    router.refresh();
  }

  async function removeMember(personId: string) {
    if (saving) {
      return;
    }

    const confirmed = window.confirm("Remove this person from the group?");

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("remove_group_member", {
      p_group_id: groupId,

      p_person_id: personId,
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
    <div>
      {/* Existing members */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
        {members.map((member, index) => (
          <div
            key={member.id}
            className={`flex items-center gap-3 px-4 py-4 ${
              index !== members.length - 1 ? "border-b border-white/[0.06]" : ""
            }`}
          >
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${member.color}`}
            >
              {member.initial}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{member.name}</p>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {member.role === "owner"
                  ? "Owner"
                  : member.isLinked
                    ? "Member · Account"
                    : "Member · Local contact"}
              </p>
            </div>

            {isOwner && member.role !== "owner" && !member.isSelf && (
              <button
                type="button"
                disabled={saving}
                onClick={() => removeMember(member.id)}
                aria-label={`Remove ${member.name}`}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Owner controls */}
      {isOwner && (
        <div className="mt-5 space-y-4">
          {/* Existing people */}
          {candidates.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
              <p className="text-sm font-semibold">Add Existing Person</p>

              <p className="mt-1 text-xs text-muted-foreground">
                Add someone you already know from another group.
              </p>

              <div className="mt-3 flex gap-2">
                <select
                  value={candidateId}
                  onChange={(event) => setCandidateId(event.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none"
                >
                  {candidates.map((person) => (
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
                  onClick={addExisting}
                  disabled={saving || !candidateId}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  Add
                </button>
              </div>
            </div>
          )}

          {/* New local contact */}
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <p className="text-sm font-semibold">New Local Contact</p>

            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Use this for someone who doesn&apos;t have a SplitHutang account
              yet.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newName}
                maxLength={80}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Name"
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
              />

              <button
                type="button"
                onClick={createLocal}
                disabled={saving || !newName.trim()}
                className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Plus className="size-4" />
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
