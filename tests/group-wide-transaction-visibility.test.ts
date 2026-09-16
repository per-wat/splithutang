import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260916070407_add_group_wide_transaction_visibility.sql",
    import.meta.url,
  ),
  "utf8",
);

const settingsForm = readFileSync(
  new URL(
    "../src/components/groups/group-settings-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("group-wide transaction visibility is opt-in", () => {
  assert.match(
    migration,
    /allow_all_members_view_transactions boolean\s+not null default false/i,
  );
  assert.match(
    migration,
    /p_allow_all_members_view_transactions boolean default null/i,
  );
  assert.match(
    migration,
    /p_allow_all_members_view_transactions,\s+allow_all_members_view_transactions/i,
  );
});

test("only active members receive group-wide visibility", () => {
  assert.match(
    migration,
    /can_view_all_group_transactions[\s\S]+private\.is_group_member\(g\.id\)/i,
  );
  assert.match(migration, /gm\.membership_status = 'active'/i);
});

test("expenses, Hutang and recurring payments use the shared visibility rule", () => {
  for (const helper of [
    "can_view_expense",
    "can_view_iou",
    "can_view_recurring",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `${helper}[\\s\\S]+private\\.can_view_all_group_transactions`,
        "i",
      ),
    );
  }
});

test("overview and recent activity functions include opted-in active members", () => {
  for (const functionName of [
    "get_expenses_overview",
    "get_ious_overview",
    "get_recent_activity",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `${functionName}[\\s\\S]+g\\.allow_all_members_view_transactions`,
        "i",
      ),
    );
  }
});

test("group settings clearly disclose historical visibility", () => {
  assert.match(settingsForm, /Show all transactions to members/);
  assert.match(settingsForm, /all past and future expenses, Hutang/);
  assert.match(settingsForm, /New members can also see the\s+existing history/);
});
