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
  new URL("../supabase/dev/seed_recurring_demo.sql", import.meta.url),
  "utf8",
);

const demoSeedMarker = readFileSync(
  new URL(
    "../supabase/migrations/20260913153529_seed_recurring_demo_dev.sql",
    import.meta.url,
  ),
  "utf8",
);

const reminderMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260913222657_recurring_due_reminders.sql",
    import.meta.url,
  ),
  "utf8",
);

const enumCastFixMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260914131111_fix_recurring_payment_enum_casts.sql",
    import.meta.url,
  ),
  "utf8",
);

const pushDelivery = readFileSync(
  new URL("../src/lib/notifications/push-delivery.ts", import.meta.url),
  "utf8",
);

const pushRoute = readFileSync(
  new URL("../src/app/api/notifications/push/route.ts", import.meta.url),
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

test("recurring enum updates cast every CASE branch to its destination type", () => {
  assert.match(
    enumCastFixMigration,
    /then 'paid'::public\.recurring_obligation_status\s+else 'pending'::public\.recurring_obligation_status/i,
  );
  assert.match(
    enumCastFixMigration,
    /then 'paid'::public\.recurring_obligation_status\s+else 'unpaid'::public\.recurring_obligation_status/i,
  );
  assert.match(
    enumCastFixMigration,
    /then 'skipped'::public\.recurring_period_state\s+else 'open'::public\.recurring_period_state/i,
  );
  assert.match(
    enumCastFixMigration,
    /then 'skipped'::public\.recurring_obligation_status\s+else 'unpaid'::public\.recurring_obligation_status/i,
  );
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
  assert.doesNotMatch(demoSeedMarker, /insert into|update public|delete from/i);
});

test("recurring reminders run seven days before and on the due date only", () => {
  assert.match(reminderMigration, /rp\.due_date in \(p_today, p_today \+ 7\)/i);
  assert.match(reminderMigration, /recurring_payment_due_soon/i);
  assert.match(reminderMigration, /recurring_payment_due/i);
  assert.match(reminderMigration, /Payment due in 1 week/i);
  assert.match(reminderMigration, /Payment due today/i);
});

test("paid, paid-early, pending, skipped and inactive recurring payments are not reminded", () => {
  assert.match(reminderMigration, /ro\.payment_status = 'unpaid'/i);
  assert.match(reminderMigration, /ra\.status = 'active'/i);
  assert.match(reminderMigration, /rp\.state = 'open'/i);
  assert.match(reminderMigration, /gm\.membership_status = 'active'/i);
  assert.match(reminderMigration, /person\.linked_user_id is not null/i);
  assert.match(reminderMigration, /g\.archived_at is null/i);
});

test("recurring reminders are idempotent and enter the existing push outbox", () => {
  assert.match(reminderMigration, /recurring-reminder:%s:%s/i);
  assert.match(reminderMigration, /candidate\.obligation_id/i);
  assert.match(reminderMigration, /candidate\.reminder_kind/i);
  assert.match(reminderMigration, /on conflict \(recipient_user_id, deduplication_key\)/i);
  assert.match(reminderMigration, /insert into public\.notification_push_outbox/i);
  assert.match(reminderMigration, /grant execute[\s\S]+to service_role/i);
  assert.doesNotMatch(reminderMigration, /grant execute[\s\S]+to authenticated/i);
});

test("the daily push job creates recurring reminders before delivery", () => {
  const creation = pushRoute.indexOf("createRecurringDueNotifications()");
  const delivery = pushRoute.indexOf("deliverPendingPushNotifications()");
  assert.ok(creation >= 0);
  assert.ok(delivery > creation);
  assert.match(pushDelivery, /recurring_payment_due_soon/);
  assert.match(pushDelivery, /notification\.title/);
  assert.match(pushDelivery, /notification\.body/);
});
