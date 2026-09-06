import assert from "node:assert/strict";
import test from "node:test";

import {
  isMeaningfulExpenseUpdate,
  isMeaningfulIouUpdate,
  getPushBrowserStatus,
  isExpiredPushStatus,
  resolveActiveGroupRecipientUserIds,
  resolveRecipientUserIds,
  shouldDeliverPush,
} from "../src/lib/notifications/rules.ts";
import { notificationPath, parseNotificationRow } from "../src/lib/notifications/types.ts";

test("recipient resolution excludes the actor after deduplicating all roles", () => {
  assert.deepEqual(
    resolveRecipientUserIds(["payer", "actor", "payer", "debtor", "actor", null], "actor"),
    ["payer", "debtor"],
  );
});

test("expense involvement includes payer, participants and item assignees without duplicates", () => {
  const payer = "user-payer";
  const participants = ["user-a", "user-b", payer];
  const itemAssignees = ["user-b", "user-c", "user-c"];
  assert.deepEqual(
    resolveRecipientUserIds([payer, ...participants, ...itemAssignees], "user-a"),
    [payer, "user-b", "user-c"],
  );
});

test("IOU counterparty rule notifies only the other linked party", () => {
  assert.deepEqual(resolveRecipientUserIds(["debtor", "creditor"], "debtor"), ["creditor"]);
});

test("group activity includes active members and excludes former members", () => {
  assert.deepEqual(
    resolveActiveGroupRecipientUserIds(
      [
        { linkedUserId: "owner", membershipStatus: "active" },
        { linkedUserId: "current", membershipStatus: "active" },
        { linkedUserId: "former", membershipStatus: "left" },
        { linkedUserId: "removed", membershipStatus: "removed" },
      ],
      "owner",
    ),
    ["current"],
  );
});

test("financial expense changes are meaningful while cosmetic labels are outside the state", () => {
  const before = {
    groupId: "group",
    paidBy: "payer",
    splitMethod: "equal",
    totalAmount: 40,
    participantShares: [["a", 20], ["b", 20]] as const,
    itemAssignments: [] as const,
  };
  assert.equal(isMeaningfulExpenseUpdate(before, { ...before }), false);
  assert.equal(isMeaningfulExpenseUpdate(before, { ...before, totalAmount: 50 }), true);
  assert.equal(
    isMeaningfulExpenseUpdate(before, {
      ...before,
      participantShares: [["a", 10], ["b", 30]],
    }),
    true,
  );
});

test("IOU amount, parties and payment state are meaningful", () => {
  const before = {
    groupId: "group",
    amount: 15,
    fromPersonId: "debtor",
    toPersonId: "creditor",
    paymentStatus: "pending",
  };
  assert.equal(isMeaningfulIouUpdate(before, { ...before }), false);
  assert.equal(isMeaningfulIouUpdate(before, { ...before, paymentStatus: "confirmed" }), true);
});

test("deleted or malformed resources never produce navigation paths", () => {
  assert.equal(notificationPath("expense", null), null);
  assert.equal(notificationPath("expense", "javascript:alert(1)"), null);
  assert.equal(notificationPath("expense", "11111111-1111-4111-8111-111111111111"), "/expenses/11111111-1111-4111-8111-111111111111");
  assert.equal(notificationPath("group_invite", "11111111-1111-4111-8111-111111111111"), "/invite/11111111-1111-4111-8111-111111111111");
});

test("push preferences filter only external delivery", () => {
  assert.equal(shouldDeliverPush("in_app_only", "iou_settled"), false);
  assert.equal(shouldDeliverPush("all_important", "group_member_joined"), true);
  assert.equal(shouldDeliverPush("payments_only", "expense_created"), false);
  assert.equal(shouldDeliverPush("payments_only", "expense_payment_confirmed"), true);
});

test("expired push endpoints are classified for subscription cleanup", () => {
  assert.equal(isExpiredPushStatus(404), true);
  assert.equal(isExpiredPushStatus(410), true);
  assert.equal(isExpiredPushStatus(429), false);
  assert.equal(isExpiredPushStatus(500), false);
});

test("unsupported and denied browsers receive actionable states", () => {
  assert.match(
    getPushBrowserStatus({ supported: false, permission: "default", subscribed: false, iosInstallRequired: false }),
    /not supported/i,
  );
  assert.match(
    getPushBrowserStatus({ supported: true, permission: "denied", subscribed: false, iosInstallRequired: false }),
    /blocked/i,
  );
  assert.match(
    getPushBrowserStatus({ supported: true, permission: "default", subscribed: false, iosInstallRequired: true }),
    /Home Screen/i,
  );
});

test("unknown notification types are rejected at the client boundary", () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    recipient_user_id: "user",
    actor_user_id: null,
    notification_type: "forged_type",
    title: "Forged",
    body: "Forged",
    group_id: null,
    resource_type: "expense",
    resource_id: null,
    metadata: {},
    deduplication_key: null,
    read_at: null,
    created_at: new Date(0).toISOString(),
  };
  assert.equal(parseNotificationRow(row), null);
});
