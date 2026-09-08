"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { parseNotificationRow, type NotificationRow } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

type NotificationContextValue = {
  unreadCount: number;
  liveNotifications: NotificationRow[];
  refreshUnreadCount: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : createClient()),
    [],
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveNotifications, setLiveNotifications] = useState<NotificationRow[]>([]);

  const refreshUnreadCount = useCallback(async () => {
    if (!supabase || !userId) {
      setUnreadCount(0);
      return;
    }

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);

    if (!error) {
      setUnreadCount(count ?? 0);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUserId(data.user?.id ?? null);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      if (!session) {
        setUnreadCount(0);
        setLiveNotifications([]);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const parsed = parseNotificationRow(
              payload.new as Tables<"notifications">,
            );

            if (parsed) {
              setLiveNotifications((current) => [
                parsed,
                ...current.filter((notification) => notification.id !== parsed.id),
              ].slice(0, 50));
            }
          }

          void refreshUnreadCount();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void refreshUnreadCount();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadCount, supabase, userId]);

  const value = useMemo(
    () => ({ unreadCount, liveNotifications, refreshUnreadCount }),
    [liveNotifications, refreshUnreadCount, unreadCount],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used inside NotificationProvider");
  }

  return context;
}
