"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { PersonSelector } from "./person-selector";

const people = [
  {
    id: "you",
    name: "You",
    initial: "Y",
    color: "bg-blue-600",
  },
  {
    id: "ahmad",
    name: "Ahmad",
    initial: "A",
    color: "bg-purple-600",
  },
  {
    id: "sarah",
    name: "Sarah",
    initial: "S",
    color: "bg-pink-600",
  },
  {
    id: "raj",
    name: "Raj",
    initial: "R",
    color: "bg-orange-600",
  },
  {
    id: "lisa",
    name: "Lisa",
    initial: "L",
    color: "bg-emerald-600",
  },
];

export function IouForm() {
  const router = useRouter();

  const [from, setFrom] = useState("you");
  const [to, setTo] = useState("ahmad");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("22/08/2026");

  const canSave =
    from !== to &&
    Number(amount) > 0 &&
    reason.trim().length > 0 &&
    date.length > 0;

  return (
    <div className="px-4 pb-8">
      {/* People */}
      <section className="rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-card">
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
          type="text"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="mt-2 h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-blue-500"
        />
      </div>

      {/* Save */}
      <button
        type="button"
        disabled={!canSave}
        onClick={() => {
          if (!canSave) return;

          console.log({
            from,
            to,
            amount: Number(amount),
            reason: reason.trim(),
            date,
          });

          router.push("/ious");
        }}
        className="mt-4 h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white/70"
      >
        Save IOU
      </button>
    </div>
  );
}
