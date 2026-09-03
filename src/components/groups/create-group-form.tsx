"use client";

import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type GroupPersonOption = {
  id: string;
  name: string;
  initial: string;
  color: string;
};

type CreateGroupFormProps = {
  people: GroupPersonOption[];
};

export function CreateGroupForm({ people }: CreateGroupFormProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");

  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);

  const [allowDebtorSelfConfirm, setAllowDebtorSelfConfirm] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  function togglePerson(personId: string) {
    setSelectedPeople((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
  }

  async function handleSave() {
    const cleanName = name.trim();

    if (!cleanName || saving) {
      return;
    }

    setSaving(true);
    setError("");

    const { data: groupId, error } = await supabase.rpc("create_group", {
      p_name: cleanName,

      p_member_ids: selectedPeople,

      p_allow_debtor_self_confirm: allowDebtorSelfConfirm,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (!groupId) {
      setError("Group was created but no group ID was returned.");
      setSaving(false);
      return;
    }

    router.push(`/groups/${groupId}`);

    router.refresh();
  }

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

          <h1 className="text-xl font-bold">New Group</h1>
        </header>

        {/* Name */}
        <section className="mt-4">
          <label
            htmlFor="group-name"
            className="text-sm font-semibold"
          >
            Group Name
          </label>

          <input
            id="group-name"
            type="text"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Office Lunch"
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
          />
        </section>

        {/* Members */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Members</h2>

          <p className="mt-1 text-xs text-muted-foreground">
            You&apos;ll automatically become the group owner.
          </p>

          {people.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-white/[0.08] bg-card p-4">
              <p className="text-sm text-muted-foreground">
                No other people are available yet.
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                You can create the group first and add local contacts
                afterwards.
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              {people.map((person, index) => {
                const selected = selectedPeople.includes(person.id);

                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => togglePerson(person.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${
                      index !== people.length - 1
                        ? "border-b border-white/[0.06]"
                        : ""
                    }`}
                  >
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${person.color}`}
                    >
                      {person.initial}
                    </div>

                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {person.name}
                    </span>

                    <div
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-white/15 text-transparent"
                      }`}
                    >
                      <Check className="size-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Payment setting */}
        <section className="mt-6 rounded-2xl border border-white/[0.08] bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Debtor self-confirm</p>

              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                When enabled, debtors can confirm their own payments without
                waiting for the receiver.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={allowDebtorSelfConfirm}
              onClick={() => setAllowDebtorSelfConfirm((value) => !value)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                allowDebtorSelfConfirm ? "bg-blue-600" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute left-1 top-1 size-5 rounded-full bg-white transition-transform ${
                  allowDebtorSelfConfirm ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="mt-6 h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Group"}
        </button>
      </div>
    </main>
  );
}
