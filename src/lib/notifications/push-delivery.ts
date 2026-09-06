import "server-only";

import webPush, { WebPushError, type PushSubscription } from "web-push";

import {
  notificationPath,
  paymentNotificationTypes,
  type NotificationType,
  type PushMode,
} from "@/lib/notifications/types";
import {
  isExpiredPushStatus,
  shouldDeliverPush,
} from "@/lib/notifications/rules";
import { createAdminClient } from "@/lib/supabase/admin";

type DeliverySummary = {
  claimed: number;
  delivered: number;
  staleSubscriptions: number;
  deferred: number;
};

export async function deliverPendingPushNotifications(): Promise<DeliverySummary> {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID environment variables are not configured");
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  const supabase = createAdminClient();
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_notification_push_outbox",
    { p_limit: 50 },
  );

  if (claimError) {
    throw new Error(`Unable to claim push outbox: ${claimError.message}`);
  }

  const claimedRows = claimed ?? [];
  const summary: DeliverySummary = {
    claimed: claimedRows.length,
    delivered: 0,
    staleSubscriptions: 0,
    deferred: 0,
  };

  for (const claimedRow of claimedRows) {
    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", claimedRow.notification_id)
      .maybeSingle();

    if (notificationError || !notification) {
      await finishOutbox(
        supabase,
        claimedRow.notification_id,
        "Notification no longer exists",
      );
      continue;
    }

    // A notification opened in-app before dispatch no longer needs a system push.
    if (notification.read_at) {
      await finishOutbox(supabase, notification.id, null);
      continue;
    }

    const { data: preference } = await supabase
      .from("notification_preferences")
      .select("push_mode")
      .eq("user_id", notification.recipient_user_id)
      .maybeSingle();
    const mode: PushMode = preference?.push_mode ?? "in_app_only";

    if (
      !shouldDeliverPush(
        mode,
        notification.notification_type as NotificationType,
      )
    ) {
      await finishOutbox(supabase, notification.id, null);
      continue;
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, created_at")
      .eq("user_id", notification.recipient_user_id)
      .lte("created_at", notification.created_at);

    if (subscriptionsError) {
      await retryOutbox(supabase, notification.id, subscriptionsError.message);
      summary.deferred += 1;
      continue;
    }

    if (!subscriptions?.length) {
      await finishOutbox(supabase, notification.id, null);
      continue;
    }

    let transientError = "";
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification(
          toPushSubscription(subscription),
          JSON.stringify(buildPushPayload(notification)),
          { TTL: 60 * 60 * 24, urgency: "normal" },
        );
        summary.delivered += 1;
      } catch (pushError) {
        if (
          pushError instanceof WebPushError &&
          isExpiredPushStatus(pushError.statusCode)
        ) {
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);

          if (!deleteError) {
            summary.staleSubscriptions += 1;
          }
        } else {
          transientError =
            pushError instanceof Error
              ? pushError.message
              : "Unknown Web Push error";
        }
      }
    }

    if (transientError) {
      await retryOutbox(supabase, notification.id, transientError);
      summary.deferred += 1;
    } else {
      await finishOutbox(supabase, notification.id, null);
    }
  }

  return summary;
}

function toPushSubscription(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): PushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
}

function buildPushPayload(notification: {
  id: string;
  notification_type: string;
  resource_type: string;
  resource_id: string | null;
}) {
  const isPayment = paymentNotificationTypes.has(
    notification.notification_type as NotificationType,
  );
  const resourceType = [
    "expense",
    "iou",
    "group",
    "person",
    "group_invite",
  ].includes(notification.resource_type)
    ? (notification.resource_type as
        | "expense"
        | "iou"
        | "group"
        | "person"
        | "group_invite")
    : null;
  const path = resourceType
    ? (notificationPath(resourceType, notification.resource_id) ??
      "/notifications")
    : "/notifications";

  return {
    title: isPayment
      ? "SplitHutang payment update"
      : "New SplitHutang activity",
    body: isPayment
      ? "A payment or settlement changed. Open SplitHutang for details."
      : "Open SplitHutang to view the update.",
    tag: notification.id,
    data: { path },
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function finishOutbox(
  supabase: AdminClient,
  notificationId: string,
  lastError: string | null,
) {
  const { error } = await supabase
    .from("notification_push_outbox")
    .update({
      processed_at: new Date().toISOString(),
      locked_at: null,
      last_error: lastError,
    })
    .eq("notification_id", notificationId);

  if (error) {
    console.error("Unable to finish push outbox row:", error);
  }
}

async function retryOutbox(
  supabase: AdminClient,
  notificationId: string,
  message: string,
) {
  const { data } = await supabase
    .from("notification_push_outbox")
    .select("attempts")
    .eq("notification_id", notificationId)
    .maybeSingle();
  const attempts = (data?.attempts ?? 0) + 1;
  const exhausted = attempts >= 8;
  const delayMinutes = Math.min(2 ** attempts, 60);

  const { error } = await supabase
    .from("notification_push_outbox")
    .update({
      attempts,
      locked_at: null,
      last_error: message.slice(0, 1000),
      next_attempt_at: new Date(
        Date.now() + delayMinutes * 60_000,
      ).toISOString(),
      processed_at: exhausted ? new Date().toISOString() : null,
    })
    .eq("notification_id", notificationId);

  if (error) {
    console.error("Unable to retry push outbox row:", error);
  }
}
