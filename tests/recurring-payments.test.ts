import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isMonthApplicable,
  splitAmountEqually,
  sumSelectedPeriods,
} from "../src/lib/recurring.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260913153006_recurring_payments.sql", import.meta.url),
  "utf8",
);

const demoSeed = readFileSync(
  new URL(
    "../supabase/migrations/20260913153529_seed_recurring_demo_dev.sql",
    import.meta.url,
  ),
  "utf8",
);

test("equal monthly split keeps exact cents", () => {
  const shares = splitAmountEqually(54.99, ["a", "b", "c"]);
  assert.deepEqual(shares, { a: 18.33, b: 18.33, c: 18.33 });

  const uneven = splitAmountEqually(10, ["a", "b", "c"]);
  assert.deepEqual(uneven, { a: 3.34, b: 3.33, c: 3.33 });
});

test("months before start and after end are not applicable", () => {
  assert.equal(isMonthApplicable(2026, 8, "2026-09-18", null), false);
  assert.equal(isMonthApplicable(2026, 9, "2026-09-18", null), true);
  assert.equal(isMonthApplicable(2027, 1, "2026-09-18", "2026-12-31"), false);
});

test("year boundaries preserve applicability", () => {
  assert.equal(isMonthApplicable(2025, 12, "2026-01-01", null), false);
  assert.equal(isMonthApplicable(2026, 1, "2026-01-01", null), true);
  assert.equal(isMonthApplicable(2027, 1, "2026-01-01", "2026-12-31"), false);
});

test("advance payment total is tied to selected exact periods", () => {
  const periods = [
    { id: "sep", shareAmount: 18.33 },
    { id: "oct", shareAmount: 18.33 },
    { id: "nov", shareAmount: 18.33 },
    { id: "dec", shareAmount: 18.33 },
  ];
  assert.equal(sumSelectedPeriods(periods, ["sep", "oct", "nov"]), 54.99);
  assert.equal(sumSelectedPeriods(periods, ["dec"]), 18.33);
});

test("schema stores immutable versioned terms and exact allocations", () => {
  assert.match(migration, /create table public\.recurring_arrangement_versions/i);
  assert.match(migration, /unique \(arrangement_id, effective_from\)/i);
  assert.match(migration, /create table public\.recurring_periods/i);
  assert.match(migration, /create table public\.recurring_obligations/i);
  assert.match(migration, /create table public\.recurring_payment_allocations/i);
  assert.match(migration, /primary key \(payment_id, obligation_id\)/i);
  assert.doesNotMatch(migration, /delete from public\.recurring_payment_allocations where payment_id/i);
  assert.match(migration, /Existing periods are never rewritten/i);
});

test("future edits reject paid history and use a new effective version", () => {
  assert.match(migration, /Historical periods cannot be changed/i);
  assert.match(migration, /Future periods with recorded payments cannot be changed/i);
  assert.match(migration, /insert into public\.recurring_arrangement_versions/i);
  assert.doesNotMatch(migration, /update public\.recurring_periods set\s+total_amount/i);
});

test("payment submission and review preserve receiver confirmation rules", () => {
  assert.match(migration, /g\.allow_debtor_self_confirm/i);
  assert.match(migration, /when v_self_person_id = v_payer_person_id or v_allow_self_confirm/i);
  assert.match(migration, /Only the payment receiver can review this payment/i);
  assert.match(migration, /payment_status = case when v_decision = 'confirmed' then 'paid' else 'unpaid' end/i);
});

test("recurring tables are RLS protected and writes are RPC-only", () => {
  for (const table of [
    "recurring_arrangements",
    "recurring_arrangement_versions",
    "recurring_version_participants",
    "recurring_periods",
    "recurring_obligations",
    "recurring_payments",
    "recurring_payment_allocations",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on public\.recurring_arrangements[\s\S]+from anon, authenticated/i);
  assert.match(migration, /private\.can_view_recurring/i);
  assert.match(migration, /membership_status = 'active'/i);
});

test("visual fixtures are hard-guarded to the SplitHutangDev identities", () => {
  assert.match(demoSeed, /DEV-ONLY visual fixture for Supabase project hnkmtlbldaiesebsqjkk/i);
  assert.match(demoSeed, /count\(distinct split_part\(email, '@', 1\)\) <> 10/i);
  assert.match(demoSeed, /perf\\\.user\(0\[1-9\]\|10\)/i);
  assert.match(demoSeed, /Skipping SplitHutangDev recurring fixtures/i);
  assert.match(demoSeed, /delete from public\.groups where id = v_group/i);
});
