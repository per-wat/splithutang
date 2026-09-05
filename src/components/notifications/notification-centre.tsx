"use client";

import {
  BellOff,
  CheckCheck,
  CircleDollarSign,
  FileText,
  Receipt,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { formatRelativeTime } from "@/lib/notifications/relative-time";
import {
  notificationPath,
  parseNotificationRow,
  type NotificationResourceType,
  type NotificationRow,
  type NotificationType,
} from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/client";

import { useNotifications } from "./notification-provider";

const pageSize = 20;

function NotificationTypeIcon({ type }: { type: NotificationType }) {
  const className = "size-4";

  if (type.startsWith("expense_payment") || type.startsWith("iou_payment") || type.endsWith("settled")) {
    return <CircleDollarSign className={className} />;
  }

  if (type.startsWith("expense")) {
    return <Receipt className={className} />;
  }

  if (type.startsWith("iou")) {
    return <FileText className={className} />;
  }

  if (
    type === "group_member_invited" ||
    type === "group_member_added" ||
    type === "group_member_joined"
  ) {
    return <UserPlus className={className} />;
  }

  return <Users className={className} />;
}

export function NotificationCentre() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { liveNotifications, refreshUnreadCount } = useNotifications();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadNotifications = useCallback(
    async (append: boolean, cursor?: string) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");

      let query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize + 1);

      if (append && cursor) {
        query = query.lt("created_at", cursor);
      }

      const { data, error: loadError } = await query;

      if (loadError) {
        setError("Unable to load notifications. Check your connection and try again.");
      } else {
        const parsed = (data ?? [])
          .map((row) => parseNotificationRow(row))
          .filter((row): row is NotificationRow => row !== null);
        const next = parsed.slice(0, pageSize);

        setHasMore(parsed.length > pageSize);
        setNotifications((current) =>
          append ? mergeNotifications(current, next) : next,
        );
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [supabase],
  );

  useEffect(() => {
    const task = window.setTimeout(() => void loadNotifications(false), 0);
    return () => window.clearTimeout(task);
  }, [loadNotifications]);

  useEffect(() => {
    if (liveNotifications.length === 0) {
      return;
    }

    const task = window.setTimeout(() => {
      setNotifications((current) =>
        mergeNotifications(liveNotifications, current),
      );
    }, 0);

    return () => window.clearTimeout(task);
  }, [liveNotifications]);

  async function setReadState(notification: NotificationRow, unread: boolean) {
    const readAt = unread ? null : new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, read_at: readAt } : item,
      ),
    );

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", notification.id);

    if (updateError) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: notification.read_at }
            : item,
        ),
      );
      setNotice("That notification could not be updated. Please try again.");
    }

    await refreshUnreadCount();
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    const previous = notifications;
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read_at: now })),
    );

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null);

    if (updateError) {
      setNotifications(previous);
      setNotice("Notifications could not be marked as read. Please try again.");
    }

    await refreshUnreadCount();
  }

  async function openNotification(notification: NotificationRow) {
    setNotice("");

    if (!notification.read_at) {
      await setReadState(notification, false);
    }

    const path = notificationPath(
      notification.resource_type,
      notification.resource_id,
    );

    if (!path || !notification.resource_id) {
      setNotice("This item was deleted, but its notification remains in your history.");
      return;
    }

    const available = await resourceIsAvailable(
      supabase,
      notification.resource_type,
      notification.resource_id,
    );

    if (!available) {
      setNotice("This item was deleted or is no longer available to you.");
      return;
    }

    router.push(path);
  }

  const hasUnread = notifications.some((notification) => !notification.read_at);

  if (loading) {
    return <NotificationSkeleton />;
  }

  if (error && notifications.length === 0) {
    return (
      <div className="px-5 pt-8">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="font-semibold text-red-400">Couldn&apos;t load notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => void loadNotifications(false)}
            className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-red-500/10 px-4 text-sm font-semibold text-red-300"
          >
            <RefreshCw className="size-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="px-5 pb-8 pt-4" aria-label="Notification history">
      <div className="mb-4 flex min-h-10 items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          {notifications.length === 0
            ? "No activity yet"
            : `${notifications.length} recent notification${notifications.length === 1 ? "" : "s"}`}
        </p>

        {hasUnread && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-blue-400 hover:bg-blue-600/10"
          >
            <CheckCheck className="size-4" /> Mark all as read
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          {notice}
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-white/[0.08] bg-card px-6 py-14 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] text-muted-foreground">
            <BellOff className="size-6" />
          </div>
          <h2 className="mt-4 font-semibold">You&apos;re all caught up</h2>
          <p className="mt-1 max-w-64 text-sm leading-relaxed text-muted-foreground">
            Expense, IOU, payment and group updates will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          {notifications.map((notification, index) => (
            <article
              key={notification.id}
              className={`relative flex gap-3 p-4 ${
                notification.read_at ? "bg-card" : "bg-blue-600/[0.07]"
              } ${index !== notifications.length - 1 ? "border-b border-white/[0.06]" : ""}`}
            >
              {!notification.read_at && (
                <span className="absolute left-1.5 top-6 size-1.5 rounded-full bg-blue-500" aria-label="Unread" />
              )}

              <ProfileAvatar
                name={notification.metadata.actor_name ?? "Someone"}
                avatarColor={notification.metadata.actor_avatar_color ?? "bg-blue-600"}
                avatarPath={notification.metadata.actor_avatar_path}
                className="size-10 text-sm"
              />

              <button
                type="button"
                onClick={() => void openNotification(notification)}
                className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={`Open notification: ${notification.title}`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-blue-400">
                    <NotificationTypeIcon type={notification.notification_type} />
                  </span>
                  <p className="text-sm font-semibold leading-snug">{notification.title}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notification.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {notification.metadata.group_name && <span>{notification.metadata.group_name}</span>}
                  {notification.metadata.group_name && <span aria-hidden="true">·</span>}
                  <time dateTime={notification.created_at}>{formatRelativeTime(notification.created_at)}</time>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void setReadState(notification, Boolean(notification.read_at))}
                className="size-10 shrink-0 rounded-full text-[11px] font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                aria-label={notification.read_at ? "Mark as unread" : "Mark as read"}
                title={notification.read_at ? "Mark as unread" : "Mark as read"}
              >
                {notification.read_at ? "Unread" : "Read"}
              </button>
            </article>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() =>
            void loadNotifications(true, notifications.at(-1)?.created_at)
          }
          disabled={loadingMore}
          className="mt-4 h-11 w-full rounded-xl border border-white/[0.08] bg-card text-sm font-semibold text-muted-foreground disabled:opacity-50"
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </section>
  );
}

function mergeNotifications(first: NotificationRow[], second: NotificationRow[]) {
  const byId = new Map<string, NotificationRow>();
  for (const notification of [...first, ...second]) {
    if (!byId.has(notification.id)) {
      byId.set(notification.id, notification);
    }
  }
  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

type BrowserClient = ReturnType<typeof createClient>;

async function resourceIsAvailable(
  supabase: BrowserClient,
  resourceType: NotificationResourceType,
  resourceId: string,
) {
  if (resourceType === "group_invite") {
    const { data, error } = await supabase.rpc("get_group_invite_preview", {
      p_token: resourceId,
    });
    const status = data?.[0]?.status;

    return !error && (status === "pending" || status === "accepted");
  }

  const tableByType = {
    expense: "expenses",
    iou: "ious",
    group: "groups",
    person: "people",
  } as const satisfies Record<Exclude<NotificationResourceType, "group_invite">, string>;
  const table = tableByType[resourceType];
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", resourceId)
    .maybeSingle();

  return !error && Boolean(data);
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3 px-5 pt-6" aria-label="Loading notifications">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex animate-pulse gap-3 rounded-2xl border border-white/[0.08] bg-card p-4">
          <div className="size-10 rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-white/[0.06]" />
            <div className="h-3 w-full rounded bg-white/[0.04]" />
            <div className="h-3 w-1/3 rounded bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}
