import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("primary money screens use the plain-language labels", () => {
  const navigation = source("src/components/layout/bottom-nav.tsx");
  const balances = source("src/components/home/balance-summary.tsx");
  const hutangForm = source("src/components/ious/iou-form.tsx");

  assert.match(navigation, /label: "Hutang"/);
  assert.match(navigation, /Add Hutang/);
  assert.match(balances, /You will receive/);
  assert.match(balances, /You need to pay/);
  assert.match(hutangForm, /Who needs to pay\?/);
  assert.match(hutangForm, /Who should receive the money\?/);
  assert.match(hutangForm, /Save Hutang/);
});

test("payment actions describe recording money instead of transferring it", () => {
  const expensePayment = source(
    "src/components/expenses/record-payment-form.tsx",
  );
  const hutangPayment = source(
    "src/components/ious/record-iou-payment-form.tsx",
  );
  const review = source("src/components/payments/payment-review-actions.tsx");

  for (const paymentForm of [expensePayment, hutangPayment]) {
    assert.match(paymentForm, /This only records the payment in SplitHutang/);
    assert.match(paymentForm, /"I’ve paid"/);
    assert.match(paymentForm, /"Mark as received"/);
  }

  assert.match(review, /Confirm received/);
  assert.match(review, /Not received/);
});

test("new notifications use Hutang and payment confirmation wording", () => {
  const migration = source(
    "supabase/migrations/20260912093000_clearer_notification_wording.sql",
  );

  assert.match(migration, /added Hutang/);
  assert.match(migration, /waiting for your confirmation/);
  assert.match(migration, /marked RM %s as not received/);
  assert.match(migration, /is fully paid/);
});
