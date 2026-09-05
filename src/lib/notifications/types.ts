import type { Json, Tables } from "@/types/database";

export const notificationTypes = [
  "expense_created",
  "expense_updated",
  "expense_deleted",
  "expense_payment_submitted",
  "expense_payment_recorded",
  "expense_payment_confirmed",
  "expense_payment_rejected",
  "expense_settled",
  "iou_created",
  "iou_updated",
  "iou_deleted",
  "iou_payment_submitted",
  "iou_payment_recorded",
  "iou_payment_confirmed",
  "iou_payment_rejected",
  "iou_settled",
  "group_member_invited",
  "group_member_added",
  "group_member_joined",
  "group_member_left",
] as const;

export type NotificationType = (typeof notificationTypes)[number];
export type NotificationResourceType =
  | "expense"
  | "iou"
  | "group"
  | "person"
  | "group_invite";
export type PushMode =
  | "in_app_only"
  | "all_important"
  | "payments_only";

export type NotificationMetadata = {
  actor_name?: string;
  actor_avatar_color?: string;
  actor_avatar_path?: string | null;
  group_name?: string;
  expense_name?: string;
  iou_reason?: string;
  member_name?: string;
  amount?: number;
  payment_status?: string;
};

export type NotificationRow = Omit<
  Tables<"notifications">,
  "notification_type" | "resource_type" | "metadata"
> & {
  notification_type: NotificationType;
  resource_type: NotificationResourceType;
  metadata: NotificationMetadata;
};

export const paymentNotificationTypes = new Set<NotificationType>([
  "expense_payment_submitted",
  "expense_payment_recorded",
  "expense_payment_confirmed",
  "expense_payment_rejected",
  "expense_settled",
  "iou_payment_submitted",
  "iou_payment_recorded",
  "iou_payment_confirmed",
  "iou_payment_rejected",
  "iou_settled",
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isNotificationType(value: string): value is NotificationType {
  return notificationTypes.includes(value as NotificationType);
}

export function parseNotificationRow(
  row: Tables<"notifications">,
): NotificationRow | null {
  if (
    !isNotificationType(row.notification_type) ||
    !["expense", "iou", "group", "person", "group_invite"].includes(
      row.resource_type,
    )
  ) {
    return null;
  }

  const metadata = isJsonObject(row.metadata) ? row.metadata : {};

  return {
    ...row,
    notification_type: row.notification_type,
    resource_type: row.resource_type as NotificationResourceType,
    metadata: parseMetadata(metadata),
  };
}

export function notificationPath(
  resourceType: NotificationResourceType,
  resourceId: string | null,
): string | null {
  if (!resourceId || !uuidPattern.test(resourceId)) {
    return null;
  }

  const routes: Record<NotificationResourceType, string> = {
    expense: "/expenses/",
    iou: "/ious/",
    group: "/groups/",
    person: "/people/",
    group_invite: "/invite/",
  };

  return `${routes[resourceType]}${resourceId}`;
}

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadata(value: { [key: string]: Json | undefined }): NotificationMetadata {
  return {
    actor_name: asString(value.actor_name),
    actor_avatar_color: asString(value.actor_avatar_color),
    actor_avatar_path:
      value.actor_avatar_path === null ? null : asString(value.actor_avatar_path),
    group_name: asString(value.group_name),
    expense_name: asString(value.expense_name),
    iou_reason: asString(value.iou_reason),
    member_name: asString(value.member_name),
    amount: typeof value.amount === "number" ? value.amount : undefined,
    payment_status: asString(value.payment_status),
  };
}

function asString(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
