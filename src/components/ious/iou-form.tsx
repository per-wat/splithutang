"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { PersonSelector } from "./person-selector";

type PersonOption = {
  id: string;
  name: string;
  initial: string;
  color: string;
  avatarPath: string | null;
  isSelf: boolean;
};

type GroupOption = {
  id: string;
  name: string;
  people: PersonOption[];
};

type IouFormProps = {
  groups: GroupOption[];
};

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function IouForm({ groups }: IouFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  const people = selectedGroup?.people ?? [];

  const selfPerson = people.find((person) => person.isSelf);

  const firstOtherPerson = people.find(
    (person) => person.id !== selfPerson?.id,
  );

  const [from, setFrom] = useState(selfPerson?.id ?? people[0]?.id ?? "");

  const [to, setTo] = useState(firstOtherPerson?.id ?? people[1]?.id ?? "");

  const [amount, setAmount] = useState("");

  const [reason, setReason] = useState("");

  const [date, setDate] = useState(getLocalDate());

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  function handleGroupChange(groupId: string) {
    setSelectedGroupId(groupId);

    const group = groups.find((item) => item.id === groupId);

    if (!group) {
      setFrom("");
      setTo("");
      return;
    }

    const self = group.people.find((person) => person.isSelf);

    const fromPerson = self ?? group.people[0];

    const toPerson = group.people.find(
      (person) => person.id !== fromPerson?.id,
    );

    setFrom(fromPerson?.id ?? "");
    setTo(toPerson?.id ?? "");
  }

  const canSave =
    selectedGroupId.length > 0 &&
    from.length > 0 &&
    to.length > 0 &&
    from !== to &&
    Number(amount) > 0 &&
    reason.trim().length > 0 &&
    date.length > 0 &&
    !saving;

  async function handleSave() {
    if (!canSave) {
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("create_iou", {
      p_group_id: selectedGroupId,

      p_from_person_id: from,

      p_to_person_id: to,

      p_amount: Number(amount),

      p_reason: reason.trim(),

      p_iou_date: date,
    });

    if (error) {
      console.error("Unable to create IOU:", error);

      setError(error.message);
      setSaving(false);

      return;
    }

    router.push("/ious");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8">
      {/* Header */}
      <header className="sticky top-0 z-20 -mx-4 bg-background px-4 pb-3 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>

          <h1 className="text-xl font-bold">Add IOU</h1>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-card px-4 py-10 text-center">
          <p className="font-medium">No groups available</p>

          <p className="mt-1 text-sm text-muted-foreground">
            Create a group before adding an IOU.
          </p>
        </div>
      ) : (
        <>
          {/* Group */}
          <section className="mt-3">
            <label
              htmlFor="group"
              className="mb-2 block text-sm font-semibold"
            >
              Group
            </label>

            <select
              id="group"
              value={selectedGroupId}
              onChange={(event) => handleGroupChange(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-blue-500"
            >
              {groups.map((group) => (
                <option
                  key={group.id}
                  value={group.id}
                >
                  {group.name}
                </option>
              ))}
            </select>
          </section>

          {/* People */}
          <section className="mt-4 rounded-2xl border border-white/[0.06] bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Who owes
            </p>

            <div className="mt-3">
              <PersonSelector
                people={people}
                selectedId={from}
                onSelect={setFrom}
              />
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowRight className="size-3" />
                owes
              </div>

              <div className="h-px flex-1 bg-border" />
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Owes to
            </p>

            <div className="mt-3">
              <PersonSelector
                people={people}
                selectedId={to}
                onSelect={setTo}
              />
            </div>
          </section>

          {/* Amount */}
          <div className="mt-4">
            <label
              htmlFor="amount"
              className="text-sm font-semibold"
            >
              Amount (RM)
            </label>

            <input
              id="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="mt-2 h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
            />
          </div>

          {/* Reason */}
          <div className="mt-4">
            <label
              htmlFor="reason"
              className="text-sm font-semibold"
            >
              Reason
            </label>

            <input
              id="reason"
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Borrowed for lunch"
              className="mt-2 h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500"
            />
          </div>

          {/* Date */}
          <div className="mt-4">
            <label
              htmlFor="date"
              className="text-sm font-semibold"
            >
              Date
            </label>

            <input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="mt-4 h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white/60"
          >
            {saving ? "Saving..." : "Save IOU"}
          </button>
        </>
      )}
    </div>
  );
}
