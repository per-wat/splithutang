"use client";

import { useState } from "react";

import { calculateInstallment } from "@/lib/installment-calculator";

const currency = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
});

function ringgit(cents: number) {
  return currency.format(cents / 100);
}

export function InstallmentCalculator() {
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("");
  const [annualRate, setAnnualRate] = useState("");

  const estimate = amount !== "" && months !== "" && annualRate !== ""
    ? calculateInstallment(Number(amount), Number(months), Number(annualRate))
    : null;
  const hasInput = amount !== "" || months !== "" || annualRate !== "";

  return (
    <div className="space-y-5 px-5 pb-8 pt-4">
      <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">Plan an installment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the purchase amount, duration, and flat annual rate.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="installment-amount" className="text-sm font-medium">Total amount (RM)</label>
          <input
            id="installment-amount"
            className="form-input"
            type="number"
            inputMode="decimal"
            min="0.01"
            max="1000000000"
            step="0.01"
            placeholder="e.g. 1000.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="installment-months" className="text-sm font-medium">Duration (months)</label>
          <input
            id="installment-months"
            className="form-input"
            type="number"
            inputMode="numeric"
            min="1"
            max="600"
            step="1"
            placeholder="e.g. 12"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="installment-rate" className="text-sm font-medium">Flat rate per annum (%)</label>
          <input
            id="installment-rate"
            className="form-input"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            placeholder="e.g. 9"
            value={annualRate}
            onChange={(event) => setAnnualRate(event.target.value)}
          />
        </div>
      </section>

      <section aria-live="polite" aria-atomic="true" className="rounded-2xl border border-white/[0.08] bg-card p-5">
        <h2 className="text-base font-semibold">Estimate</h2>
        {estimate ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-600/10 p-4">
              <p className="text-sm text-blue-200">Monthly payment</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{ringgit(estimate.monthlyCents)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {Number(months) === 1 ? "One payment" : `First ${Number(months) - 1} payments`}
              </p>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Final payment</dt>
                <dd className="font-semibold tabular-nums">{ringgit(estimate.finalCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Total profit / charges</dt>
                <dd className="font-semibold tabular-nums">{ringgit(estimate.profitCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.08] pt-3">
                <dt className="text-muted-foreground">Total to pay</dt>
                <dd className="font-semibold tabular-nums">{ringgit(estimate.totalCents)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {hasInput
              ? "Enter a valid amount (up to RM1 billion), 1–600 whole months, and a rate from 0–100%."
              : "Fill in all three fields to see your estimated payments."}
          </p>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Estimate uses a flat rate on the original amount: amount × annual rate × months ÷ 12.
        Total profit is rounded to the nearest sen. Payments are rounded to the nearest sen,
        with the final payment adjusted so the total adds up exactly. Actual bank offers,
        fees, and repayment schedules may differ. Nothing entered here is saved.
      </p>
    </div>
  );
}
