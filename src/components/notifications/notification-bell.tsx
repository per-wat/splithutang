"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { useNotifications } from "./notification-provider";

export function NotificationBell({ className = "" }: { className?: string }) {
  const { unreadCount } = useNotifications();

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-card text-muted-foreground transition-colors hover:text-foreground active:scale-95 ${className}`}
    >
      <Bell className="size-5" />

      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-5 text-white ring-2 ring-background">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
