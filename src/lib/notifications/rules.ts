import {
  paymentNotificationTypes,
  type NotificationType,
  type PushMode,
} from "./types.ts";

export function resolveRecipientUserIds(
  candidateUserIds: ReadonlyArray<string | null | undefined>,
  actorUserId: string | null,
) {
  return Array.from(
    new Set(
      candidateUserIds.filter(
        (userId): userId is string => Boolean(userId) && userId !== actorUserId,
      ),
    ),
  );
}

export function resolveActiveGroupRecipientUserIds(
  members: ReadonlyArray<{
    linkedUserId: string | null;
    membershipStatus: "active" | "left" | "removed";
  }>,
  actorUserId: string | null,
) {
  return resolveRecipientUserIds(
    members
      .filter((member) => member.membershipStatus === "active")
      .map((member) => member.linkedUserId),
    actorUserId,
  );
}

export function shouldDeliverPush(
  mode: PushMode,
  notificationType: NotificationType,
) {
  if (mode === "in_app_only") return false;
  if (mode === "all_important") return true;
  return paymentNotificationTypes.has(notificationType);
}

export function isExpiredPushStatus(statusCode: number) {
  return statusCode === 404 || statusCode === 410;
}

export function getPushBrowserStatus(input: {
  supported: boolean | null;
  permission: NotificationPermission;
  subscribed: boolean;
  iosInstallRequired: boolean;
}) {
  if (input.supported === null) return "Checking support...";
  if (!input.supported) return "Web Push is not supported here. In-app notifications still work.";
  if (input.iosInstallRequired) return "Install to the Home Screen before enabling push.";
  if (input.permission === "denied") return "Notification permission is blocked.";
  if (input.subscribed) return "Subscribed for push notifications.";
  return "Not subscribed on this browser.";
}

type ExpenseFinancialState = {
  groupId: string;
  paidBy: string;
  splitMethod: string;
  totalAmount: number;
  participantShares: ReadonlyArray<readonly [string, number]>;
  itemAssignments: ReadonlyArray<readonly [string, number, ReadonlyArray<string>]>;
};

type IouFinancialState = {
  groupId: string;
  amount: number;
  fromPersonId: string;
  toPersonId: string;
  paymentStatus: string;
};

export function isMeaningfulExpenseUpdate(
  before: ExpenseFinancialState,
  after: ExpenseFinancialState,
) {
  return stableFinancialValue(before) !== stableFinancialValue(after);
}

export function isMeaningfulIouUpdate(
  before: IouFinancialState,
  after: IouFinancialState,
) {
  return stableFinancialValue(before) !== stableFinancialValue(after);
}

function stableFinancialValue(value: ExpenseFinancialState | IouFinancialState) {
  return JSON.stringify(value);
}
