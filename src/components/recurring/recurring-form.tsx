"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { splitAmountEqually, type RecurringDetail } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/client";

export type RecurringPersonOption = {
  id: string;
  name: string;
  color: string;
  isSelf: boolean;
};

export type RecurringGroupOption = {
  id: string;
  name: string;
  people: RecurringPersonOption[];
};

type RecurringFormProps = {
  groups: RecurringGroupOption[];
  existing?: RecurringDetail;
};

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextMonthStart() {
  const date = new Date();
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

export function RecurringForm({ groups, existing }: RecurringFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const editing = Boolean(existing);
  const initialGroup = groups.find((group) => group.id === existing?.groupId) ?? groups[0];
  const [groupId, setGroupId] = useState(initialGroup?.id ?? "");
  const group = groups.find((item) => item.id === groupId);
  const people = group?.people ?? [];
  const initialPayer = existing?.payerPersonId ?? people.find((person) => person.isSelf)?.id ?? people[0]?.id ?? "";
  const [name, setName] = useState(existing?.name ?? "");
  const [payerId, setPayerId] = useState(initialPayer);
  const [total, setTotal] = useState(existing?.currentVersion.totalAmount.toFixed(2) ?? "");
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existing?.currentVersion.participants.map((person) => person.personId) ?? people.map((person) => person.id),
  );
  const [customShares, setCustomShares] = useState<Record<string, string>>(
    Object.fromEntries(existing?.currentVersion.participants.map((person) => [person.personId, person.shareAmount.toFixed(2)]) ?? []),
  );
  const [startDate, setStartDate] = useState(existing?.startDate ?? localDate());
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [dueDay, setDueDay] = useState(String(existing?.currentVersion.dueDay ?? new Date().getDate()));
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthStart());
  const [status, setStatus] = useState<"active" | "paused" | "ended">(existing?.status ?? "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const numericTotal = Number(total) || 0;
  const equalShares = splitAmountEqually(numericTotal, selectedIds);
  const shares = splitMode === "equal"
    ? equalShares
    : Object.fromEntries(selectedIds.map((id) => [id, Number(customShares[id]) || 0]));
  const shareTotal = Object.values(shares).reduce((sum, amount) => sum + amount, 0);
  const shareMatches = Math.round(shareTotal * 100) === Math.round(numericTotal * 100);
  const canSave = Boolean(
    groupId && payerId && selectedIds.includes(payerId) && selectedIds.length > 0 &&
    name.trim() && numericTotal > 0 && Number(dueDay) >= 1 && Number(dueDay) <= 31 &&
    startDate && shareMatches && (!editing || effectiveFrom) && (status !== "ended" || endDate) && !saving,
  );

  function selectGroup(id: string) {
    const next = groups.find((item) => item.id === id);
    const nextPayer = next?.people.find((person) => person.isSelf)?.id ?? next?.people[0]?.id ?? "";
    setGroupId(id);
    setPayerId(nextPayer);
    setSelectedIds(next?.people.map((person) => person.id) ?? []);
    setCustomShares({});
  }

  function togglePerson(id: string) {
    if (id === payerId) return;
    setSelectedIds((current) => current.includes(id)
      ? current.filter((personId) => personId !== id)
      : [...current, id]);
  }

  function selectPayer(id: string) {
    setPayerId(id);
    setSelectedIds((current) => current.includes(id) ? current : [id, ...current]);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    const participants = selectedIds.map((personId) => ({ person_id: personId, share_amount: shares[personId] }));

    const result = existing
      ? await supabase.rpc("update_recurring_arrangement", {
          p_arrangement_id: existing.id,
          p_name: name.trim(),
          p_total_amount: numericTotal,
          p_participants: participants,
          p_due_day: Number(dueDay),
          p_effective_from: effectiveFrom,
          p_end_date: endDate || null,
          p_status: status,
        })
      : await supabase.rpc("create_recurring_arrangement", {
          p_group_id: groupId,
          p_name: name.trim(),
          p_payer_person_id: payerId,
          p_total_amount: numericTotal,
          p_participants: participants,
          p_frequency: "monthly",
          p_start_date: startDate,
          p_end_date: endDate || null,
          p_due_day: Number(dueDay),
        });

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }
    const id = existing?.id ?? result.data;
    router.push(id ? `/recurring/${id}` : "/recurring");
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <button type="button" onClick={() => router.back()} aria-label="Go back" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-xl font-bold">{editing ? "Edit Recurring Payment" : "Add Recurring Payment"}</h1>
        </header>

        {groups.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-card p-6 text-center text-sm text-muted-foreground">Create a group before adding a recurring payment.</div>
        ) : (
          <div className="space-y-5 pt-3">
            <Field label="What is this payment for?" htmlFor="recurring-name">
              <input id="recurring-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="e.g. Netflix Family" className="form-input" />
            </Field>

            <Field label="Group" htmlFor="recurring-group">
              <select id="recurring-group" value={groupId} disabled={editing} onChange={(event) => selectGroup(event.target.value)} className="form-input disabled:opacity-60">
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>

            <Field label="Who pays the full bill?" htmlFor="recurring-payer">
              <select id="recurring-payer" value={payerId} disabled={editing} onChange={(event) => selectPayer(event.target.value)} className="form-input disabled:opacity-60">
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </Field>

            <Field label="Full monthly amount (RM)" htmlFor="recurring-total">
              <input id="recurring-total" type="number" inputMode="decimal" min="0.01" step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="0.00" className="form-input" />
            </Field>

            <section>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Who is included?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Choose everyone who pays part of this bill. The person paying the full bill is included.</p>
                </div>
                <div className="flex rounded-xl bg-white/[0.05] p-1 text-xs">
                  {(["equal", "custom"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => {
                      if (mode === "custom" && splitMode !== "custom") {
                        setCustomShares(Object.fromEntries(selectedIds.map((id) => [id, (equalShares[id] ?? 0).toFixed(2)])));
                      }
                      setSplitMode(mode);
                    }} className={`rounded-lg px-3 py-1.5 font-semibold ${splitMode === mode ? "bg-blue-600 text-white" : "text-muted-foreground"}`}>{mode === "equal" ? "Equal amounts" : "Custom amounts"}</button>
                  ))}
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
                {people.map((person, index) => {
                  const selected = selectedIds.includes(person.id);
                  return (
                    <div key={person.id} className={`flex items-center gap-3 px-4 py-3 ${index < people.length - 1 ? "border-b border-white/[0.06]" : ""}`}>
                      <button type="button" onClick={() => togglePerson(person.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className={`flex size-8 items-center justify-center rounded-full text-xs font-bold text-white ${person.color}`}>{person.name.charAt(0).toUpperCase()}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}{person.id === payerId ? " · pays full bill" : ""}</span>
                        <span className={`flex size-6 items-center justify-center rounded-full border ${selected ? "border-blue-500 bg-blue-600 text-white" : "border-white/15 text-transparent"}`}><Check className="size-4" /></span>
                      </button>
                      {selected && (splitMode === "custom" ? (
                        <input aria-label={`${person.name} monthly amount`} type="number" inputMode="decimal" step="0.01" min="0" value={customShares[person.id] ?? ""} onChange={(event) => setCustomShares((current) => ({ ...current, [person.id]: event.target.value }))} className="h-9 w-20 rounded-xl border border-border bg-background px-2 text-right text-sm outline-none focus:border-blue-500" />
                      ) : (
                        <span className="w-20 text-right text-sm font-semibold">RM {(equalShares[person.id] ?? 0).toFixed(2)}</span>
                      ))}
                    </div>
                  );
                })}
              </div>
              {!shareMatches && <p className="mt-2 text-xs text-red-400">The individual amounts add up to RM {shareTotal.toFixed(2)}. They must match the full monthly amount of RM {numericTotal.toFixed(2)}.</p>}
            </section>

            <div className="grid grid-cols-2 gap-3">
              {!editing ? <Field label="Starts on" htmlFor="recurring-start"><input id="recurring-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="form-input" /></Field>
                : <Field label="Changes start on" htmlFor="recurring-effective"><input id="recurring-effective" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="form-input" /><p className="mt-1 text-[11px] text-muted-foreground">Choose the first day of a future month.</p></Field>}
              <Field label="Payment day each month" htmlFor="recurring-due"><input id="recurring-due" type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} className="form-input" /></Field>
            </div>

            <Field label="Ends on (optional)" htmlFor="recurring-end"><input id="recurring-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="form-input" /></Field>
            {editing && <Field label="Current status" htmlFor="recurring-status"><select id="recurring-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="form-input"><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></Field>}

            {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
            <button type="button" disabled={!canSave} onClick={save} className="h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : editing ? "Save changes" : "Add recurring payment"}</button>
            {editing && <p className="text-center text-xs leading-relaxed text-muted-foreground">Months already paid or waiting for confirmation will not change. These changes only apply from the selected month.</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label><div className="mt-2">{children}</div></div>;
}
