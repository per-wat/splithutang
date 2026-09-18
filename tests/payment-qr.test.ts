import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPaymentReference,
  formatPaymentAmountForClipboard,
} from "../src/lib/payment-transfer.ts";

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

test("every payer payment popup uses the shared transfer details", () => {
  const expense = source("src/components/expenses/record-payment-form.tsx");
  const hutang = source("src/components/ious/record-iou-payment-form.tsx");
  const recurring = source(
    "src/components/recurring/recurring-payment-form.tsx",
  );
  const transferDetails = source(
    "src/components/payments/payment-transfer-details.tsx",
  );
  const panel = source("src/components/payments/payment-qr-panel.tsx");

  for (const paymentForm of [expense, hutang, recurring]) {
    assert.match(paymentForm, /<PaymentTransferDetails/);
    assert.match(paymentForm, /receiverPaymentQrPath/);
    assert.match(paymentForm, /mark-paid/);
    assert.match(paymentForm, /buildPaymentReference/);
    assert.match(paymentForm, /You’re offline/);
  }

  assert.match(transferDetails, /navigator\.clipboard\?\.writeText/);
  assert.match(transferDetails, /Couldn’t copy the \$\{target\}/);
  assert.match(transferDetails, /Payment reference/);
  assert.match(transferDetails, /Amount/);
  assert.match(panel, /\.from\("payment-qrs"\)/);
  assert.match(panel, /\.download\(paymentQrPath/);
  assert.match(panel, /link\.download = fileName/);
  assert.match(panel, /Download QR/);
  assert.match(panel, /View full screen/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /You’re offline\. Reconnect to load this payment QR/);
  assert.match(panel, /Unable to download this QR/);
  assert.match(panel, /No payment QR available/);
  assert.match(panel, /hasn’t saved a payment QR yet/);
});

test("payment references are useful, bounded, and contain no internal IDs", () => {
  assert.equal(
    buildPaymentReference({
      kind: "expense",
      transactionName: "  Nasi   Lemak  ",
    }),
    "SplitHutang - Expense - Nasi Lemak",
  );
  assert.equal(
    buildPaymentReference({
      kind: "iou",
      transactionName: "Concert tickets",
    }),
    "SplitHutang - Hutang - Concert tickets",
  );
  assert.equal(
    buildPaymentReference({
      kind: "recurring",
      transactionName: "Netflix",
      qualifier: "Sep 2026, Oct 2026",
    }),
    "SplitHutang - Recurring - Netflix - Sep 2026, Oct 2026",
  );

  const longReference = buildPaymentReference({
    kind: "expense",
    transactionName: "A".repeat(100),
  });
  assert.equal(longReference.length, 80);
  assert.equal(longReference.endsWith("..."), true);

  for (const paymentForm of [
    source("src/components/expenses/record-payment-form.tsx"),
    source("src/components/ious/record-iou-payment-form.tsx"),
    source("src/components/recurring/recurring-payment-form.tsx"),
  ]) {
    assert.doesNotMatch(
      paymentForm,
      /transactionName:\s*(expenseId|iouId|arrangementId)/,
    );
  }
});

test("copied amounts use bank-friendly fixed decimals", () => {
  assert.equal(formatPaymentAmountForClipboard(12), "12.00");
  assert.equal(formatPaymentAmountForClipboard(12.345), "12.35");
  assert.equal(formatPaymentAmountForClipboard(Number.NaN), "0.00");
});
