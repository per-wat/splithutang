"use client";

import { Check, Copy, Link2, RotateCcw, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatTimestampDateMY } from "@/lib/date-format";
import { createClient } from "@/lib/supabase/client";

export type LocalGroupMemberOption = {
  id: string;
  name: string;
};

export type GroupInviteView = {
  inviteId: string;

  personId: string | null;

  personName: string;

  email: string;

  token: string;

  status: string;

  expiresAt: string;

  acceptedAt: string | null;

  claimedPersonId: string | null;
};

type GroupInviteManagerProps = {
  groupId: string;

  localMembers: LocalGroupMemberOption[];

  invites: GroupInviteView[];
};

function getStatusClasses(status: string) {
  switch (status) {
    case "accepted":
      return "bg-emerald-500/10 text-emerald-400";

    case "pending":
      return "bg-amber-500/10 text-amber-400";

    case "revoked":
      return "bg-red-500/10 text-red-400";

    case "expired":
      return "bg-white/[0.06] text-muted-foreground";

    default:
      return "bg-white/[0.06] text-muted-foreground";
  }
}

export function GroupInviteManager({
  groupId,
  localMembers,
  invites,
}: GroupInviteManagerProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [selectedPersonId, setSelectedPersonId] = useState(
    localMembers[0]?.id ?? "",
  );

  const effectiveSelectedPersonId = localMembers.some(
    (person) => person.id === selectedPersonId,
  )
    ? selectedPersonId
    : (localMembers[0]?.id ?? "");

  const [email, setEmail] = useState("");

  const [generatedLink, setGeneratedLink] = useState("");

  const [copiedValue, setCopiedValue] = useState("");

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  async function createInvite() {
    const cleanEmail = email.trim().toLowerCase();

    if (!effectiveSelectedPersonId || !cleanEmail || saving) {
      return;
    }

    setSaving(true);
    setError("");
    setGeneratedLink("");

    const { data: token, error } = await supabase.rpc("create_group_invite", {
      p_group_id: groupId,

      p_person_id: effectiveSelectedPersonId,

      p_email: cleanEmail,
    });

    if (error) {
      setError(error.message);

      setSaving(false);
      return;
    }

    if (!token) {
      setError("Invitation was created but no token was returned.");

      setSaving(false);
      return;
    }

    const link = `${window.location.origin}/invite/${token}`;

    setGeneratedLink(link);

    setSaving(false);

    router.refresh();
  }

  async function revokeInvite(inviteId: string) {
    if (saving) {
      return;
    }

    const confirmed = window.confirm("Revoke this invitation?");

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("revoke_group_invite", {
      p_invite_id: inviteId,
    });

    if (error) {
      setError(error.message);

      setSaving(false);
      return;
    }

    setGeneratedLink("");

    setSaving(false);

    router.refresh();
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);

      setCopiedValue(value);

      window.setTimeout(() => {
        setCopiedValue("");
      }, 1500);
    } catch {
      setError("Unable to copy the link. Please copy it manually.");
    }
  }

  function getInviteLink(token: string) {
    if (typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}/invite/${token}`;
  }

  return (
    <div className="space-y-5">
      {/* Create invitation */}
      {localMembers.length > 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10">
              <Send className="size-4 text-purple-400" />
            </div>

            <div>
              <p className="text-sm font-semibold">Invite Local Contact</p>

              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Link a local contact to their own SplitHutang account.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="invite-person"
              className="text-xs font-semibold text-muted-foreground"
            >
              Person
            </label>

            <select
              id="invite-person"
              value={effectiveSelectedPersonId}
              onChange={(event) => setSelectedPersonId(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-blue-500"
            >
              {localMembers.map((person) => (
                <option
                  key={person.id}
                  value={person.id}
                >
                  {person.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label
              htmlFor="invite-email"
              className="text-xs font-semibold text-muted-foreground"
            >
              Their Email
            </label>

            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="sarah@example.com"
              autoComplete="email"
              className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={createInvite}
            disabled={saving || !effectiveSelectedPersonId || !email.trim()}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            <Link2 className="size-4" />

            {saving ? "Creating..." : "Generate Invite Link"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
          <p className="text-sm font-semibold">No local contacts available</p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Everyone in this group already has a SplitHutang account, or there
            are no local contacts to invite.
          </p>
        </div>
      )}

      {/* Newly generated link */}
      {generatedLink && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
          <p className="text-sm font-semibold text-emerald-400">Invite ready</p>

          <p className="mt-1 text-xs text-muted-foreground">
            Send this link only to the person whose email you entered.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={generatedLink}
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-background px-3 text-xs text-muted-foreground"
            />

            <button
              type="button"
              onClick={() => copyText(generatedLink)}
              aria-label="Copy invite link"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"
            >
              {copiedValue === generatedLink ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Invitation history */}
      {invites.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Invitations
          </p>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
            {invites.map((invite, index) => {
              const inviteLink = getInviteLink(invite.token);

              return (
                <div
                  key={invite.inviteId}
                  className={`p-4 ${
                    index !== invites.length - 1
                      ? "border-b border-white/[0.06]"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {invite.personName}
                      </p>

                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {invite.email}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${getStatusClasses(
                        invite.status,
                      )}`}
                    >
                      {invite.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {invite.status === "pending"
                      ? `Expires ${formatTimestampDateMY(invite.expiresAt)}`
                      : invite.status === "accepted" && invite.acceptedAt
                        ? `Accepted ${formatTimestampDateMY(invite.acceptedAt)}`
                        : "Invitation no longer active"}
                  </p>

                  {invite.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(inviteLink)}
                        disabled={!inviteLink}
                        className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600/10 text-xs font-semibold text-blue-400"
                      >
                        {copiedValue === inviteLink ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        Copy Link
                      </button>

                      <button
                        type="button"
                        onClick={() => revokeInvite(invite.inviteId)}
                        disabled={saving}
                        className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/10 text-xs font-semibold text-red-400"
                      >
                        <X className="size-3.5" />
                        Revoke
                      </button>
                    </div>
                  )}

                  {invite.status === "expired" && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <RotateCcw className="size-3.5" />
                      Create a new invitation above.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
