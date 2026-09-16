import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = source(
  "supabase/migrations/20260916160018_payment_qr.sql",
);

test("payment QR images stay private and user-owned", () => {
  assert.match(
    migration,
    /'payment-qrs',\s*'payment-qrs',\s*false,/i,
  );
  assert.match(
    migration,
    /payment_qr_insert_own_folder[\s\S]+storage\.foldername\(name\)[\s\S]+auth\.uid\(\)/i,
  );
  assert.match(
    migration,
    /payment_qr_delete_own_folder[\s\S]+storage\.foldername\(name\)[\s\S]+auth\.uid\(\)/i,
  );
  assert.match(
    migration,
    /private\.can_read_payment_qr\(\(storage\.foldername\(name\)\)\[1\]\)/i,
  );
});

test("only owners and people who need to pay can read a QR", () => {
  assert.match(
    migration,
    /auth\.uid\(\)[\s\S]+p_owner_user_id[\s\S]+public\.expense_participants/i,
  );
  assert.match(migration, /private\.can_view_expense\(e\.id\)/i);
  assert.match(migration, /private\.can_view_iou\(i\.id\)/i);
  assert.match(migration, /private\.can_view_recurring\(period\.arrangement_id\)/i);
  assert.match(migration, /obligation\.payment_status = 'unpaid'/i);
});

test("payment QR settings are available under Support and setup", () => {
  const menu = source("src/components/layout/app-menu.tsx");
  const page = source("src/app/payment-qr/page.tsx");
  const settings = source("src/components/settings/payment-qr-settings.tsx");

  assert.match(menu, /label: "Payment QR", href: "\/payment-qr"/);
  assert.match(page, /<PaymentQrSettings/);
  assert.match(settings, /Save payment QR/);
  assert.match(settings, /Remove payment QR/);
  assert.match(settings, /update_my_payment_qr/);
});

test("every payer payment popup can display and download the receiver QR", () => {
  const expense = source("src/components/expenses/record-payment-form.tsx");
  const hutang = source("src/components/ious/record-iou-payment-form.tsx");
  const recurring = source(
    "src/components/recurring/recurring-payment-form.tsx",
  );
  const panel = source("src/components/payments/payment-qr-panel.tsx");

  for (const paymentForm of [expense, hutang, recurring]) {
    assert.match(paymentForm, /<PaymentQrPanel/);
    assert.match(paymentForm, /receiverPaymentQrPath/);
    assert.match(paymentForm, /mark-paid/);
  }

  assert.match(panel, /\.from\("payment-qrs"\)/);
  assert.match(panel, /\.download\(paymentQrPath/);
  assert.match(panel, /download=\{fileName\}/);
  assert.match(panel, /Download QR/);
});
