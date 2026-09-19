"use client";

import {
  ChevronRight,
  Info,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useNotifications } from "@/components/notifications/notification-provider";
import {
  notificationPath,
  parseNotificationRow,
  type NotificationRow,
} from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/client";

const categoryStyle = {
  new_feature: {
    icon: Sparkles,
    shell: "border-violet-500/25 bg-violet-500/[0.09]",
    iconClass: "bg-violet-500/15 text-violet-300",
  },
  information: {
    icon: Info,
    shell: "border-blue-500/25 bg-blue-500/[0.09]",
    iconClass: "bg-blue-500/15 text-blue-300",
  },
  maintenance: {
    icon: Wrench,
    shell: "border-amber-500/25 bg-amber-500/[0.09]",
    iconClass: "bg-amber-500/15 text-amber-300",
  },
  urgent: {
    icon: TriangleAlert,
    shell: "border-red-500/25 bg-red-500/[0.09]",
    iconClass: "bg-red-500/15 text-red-300",
  },
} as const;

export function AnnouncementBanner() {
  const router = useRouter();
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : createClient()),
    [],
  );
  const { liveNotifications, refreshUnreadCount } = useNotifications();
  const [announcements, setAnnouncements] = useState<NotificationRow[]>([]);
  const [message, setMessage] = useState("");

  const loadAnnouncements = useCallback(async () => {
    if (!supabase) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("notification_type", "announcement_published")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const parsed = (data ?? [])
      .map((row) => parseNotificationRow(row))
      .filter(
        (row): row is NotificationRow =>
          row !== null && row.notification_type === "announcement_published",
      );
    setAnnouncements(parsed);
  }, [supabase]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadAnnouncements(), 0);
    return () => window.clearTimeout(task);
  }, [loadAnnouncements]);

  useEffect(() => {
    const incoming = liveNotifications.filter(
      (notification) => notification.notification_type === "announcement_published",
    );
    if (incoming.length === 0) return;

    const task = window.setTimeout(() => {
      setAnnouncements((current) => mergeAnnouncements(incoming, current));
    }, 0);
    return () => window.clearTimeout(task);
  }, [liveNotifications]);

  useEffect(() => {
    const expired = announcements.filter(isExpired);
    if (expired.length === 0) return;

    const task = window.setTimeout(async () => {
      if (!supabase) return;

      const ids = expired.map((announcement) => announcement.id);
      setAnnouncements((current) =>
        current.filter((announcement) => !ids.includes(announcement.id)),
      );
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .is("read_at", null);
      await refreshUnreadCount();
    }, 0);

    return () => window.clearTimeout(task);
  }, [announcements, refreshUnreadCount, supabase]);

  const current = announcements.find(
    (announcement) => !announcement.read_at && !isExpired(announcement),
  );
  if (!current) return null;

  const category = current.metadata.announcement_category ?? "information";
  const style = categoryStyle[category];
  const Icon = style.icon;
  const path =
    current.metadata.action_path ??
    notificationPath(current.resource_type, current.resource_id);
  const actionLabel = current.metadata.action_label ?? "View details";

  async function dismiss(announcement: NotificationRow) {
    if (!supabase) return;

    setMessage("");
    setAnnouncements((items) =>
      items.filter((item) => item.id !== announcement.id),
    );
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", announcement.id);

    if (error) {
      setAnnouncements((items) => mergeAnnouncements([announcement], items));
      setMessage("Unable to dismiss this announcement. Please try again.");
    }
    await refreshUnreadCount();
  }

  async function openAnnouncement() {
    if (!current || !path) return;
    await dismiss(current);
    router.push(path);
  }

  return (
    <section className="px-5 pt-4" aria-label="Announcement">
      <div className={`rounded-2xl border p-4 ${style.shell}`}>
        <div className="flex items-start gap-3">
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${style.iconClass}`}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{current.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
              {current.body}
            </p>
            {path && (
              <button
                type="button"
                onClick={() => void openAnnouncement()}
                className="mt-3 flex h-9 items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 text-xs font-semibold text-white hover:bg-white/[0.11]"
              >
                {actionLabel} <ChevronRight className="size-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void dismiss(current)}
            aria-label="Dismiss announcement"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.07] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
        {message && (
          <p role="status" className="mt-3 text-xs text-red-300">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

function isExpired(notification: NotificationRow) {
  const expiresAt = notification.metadata.expires_at;
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

function mergeAnnouncements(first: NotificationRow[], second: NotificationRow[]) {
  const byId = new Map<string, NotificationRow>();
  for (const notification of [...first, ...second]) {
    if (!byId.has(notification.id)) {
      byId.set(notification.id, notification);
    }
  }

  return Array.from(byId.values())
    .filter((notification) => !notification.read_at)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
}
