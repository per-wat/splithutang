"use client";

import {
  Archive,
  BellRing,
  CalendarClock,
  Info,
  Megaphone,
  Send,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  announcementCategories,
  announcementCategoryLabels,
  type AnnouncementCategory,
} from "@/lib/announcements";
import type { Tables } from "@/types/database";

type Announcement = Tables<"announcements">;

type PublishResponse = {
  announcement?: Announcement;
  error?: string;
};

const categoryIcons = {
  new_feature: Sparkles,
  information: Info,
  maintenance: Wrench,
  urgent: TriangleAlert,
} satisfies Record<AnnouncementCategory, typeof Info>;

export function AnnouncementManager({
  initialAnnouncements,
  currentUserCount,
}: {
  initialAnnouncements: Announcement[];
  currentUserCount: number;
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] =
    useState<AnnouncementCategory>("information");
  const [actionLabel, setActionLabel] = useState("");
  const [actionPath, setActionPath] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendPush, setSendPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const preview = useMemo(
    () => ({
      title: title.trim() || "Your announcement title",
      body:
        body.trim() ||
        "Your message will appear here exactly as users will see it.",
      category,
    }),
    [body, category, title],
  );

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const confirmed = window.confirm(
      `Publish this announcement to ${currentUserCount} user${currentUserCount === 1 ? "" : "s"}?${
        sendPush
          ? " Eligible users may also receive a Web Push notification."
          : " This will be in-app only."
      }`,
    );

    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          category,
          actionLabel: actionLabel || null,
          actionPath: actionPath || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          sendPush,
        }),
      });
      const result = (await response.json()) as PublishResponse;

      if (!response.ok || !result.announcement) {
        setError(
          result.error ?? "Unable to publish the announcement. Please try again.",
        );
        return;
      }

      setAnnouncements((current) => [
        result.announcement as Announcement,
        ...current,
      ]);
      setTitle("");
      setBody("");
      setCategory("information");
      setActionLabel("");
      setActionPath("");
      setExpiresAt("");
      setSendPush(false);
      setNotice(
        `Announcement published to ${result.announcement.recipient_count} user${
          result.announcement.recipient_count === 1 ? "" : "s"
        }.`,
      );
    } catch {
      setError(
        navigator.onLine
          ? "Unable to publish the announcement. Please try again."
          : "You are offline. Reconnect before publishing the announcement.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateAnnouncement(
    announcement: Announcement,
    action: "expire" | "archive",
  ) {
    setError("");
    setNotice("");
    const label = action === "expire" ? "end this announcement now" : "archive this announcement";

    if (!window.confirm(`Are you sure you want to ${label}?`)) return;

    setUpdatingId(announcement.id);
    try {
      const response = await fetch(`/api/announcements/${announcement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as PublishResponse;

      if (!response.ok || !result.announcement) {
        setError(
          result.error ?? "Unable to update the announcement. Please try again.",
        );
        return;
      }

      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id
            ? (result.announcement as Announcement)
            : item,
        ),
      );
      setNotice(
        action === "expire" ? "Announcement ended." : "Announcement archived.",
      );
    } catch {
      setError(
        navigator.onLine
          ? "Unable to update the announcement. Please try again."
          : "You are offline. Reconnect before updating the announcement.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="space-y-6 px-5 pb-10 pt-5">
      <form
        onSubmit={publishAnnouncement}
        className="space-y-5 rounded-3xl border border-white/[0.08] bg-card p-5"
      >
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="size-5 text-blue-400" />
            <h2 className="font-semibold">Create announcement</h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Publishing immediately creates an in-app notification for every
            registered user.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold text-zinc-300">Type</span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as AnnouncementCategory)
            }
            className="h-12 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500/60"
          >
            {announcementCategories.map((value) => (
              <option key={value} value={value}>
                {announcementCategoryLabels[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-semibold text-zinc-300">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
            placeholder="Scheduled maintenance"
            className="h-12 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-blue-500/60"
          />
          <span className="block text-right text-[11px] text-muted-foreground">
            {title.length}/100
          </span>
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-semibold text-zinc-300">Message</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            required
            rows={5}
            placeholder="SplitHutang will be unavailable tonight from 11:00 PM to midnight."
            className="w-full resize-y rounded-xl border border-white/[0.08] bg-zinc-950 p-3 text-sm leading-relaxed outline-none placeholder:text-zinc-600 focus:border-blue-500/60"
          />
          <span className="block text-right text-[11px] text-muted-foreground">
            {body.length}/2000
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-semibold text-zinc-300">
              Button label <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              value={actionLabel}
              onChange={(event) => setActionLabel(event.target.value)}
              maxLength={40}
              placeholder="See what’s new"
              className="h-12 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-blue-500/60"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold text-zinc-300">
              App path <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              value={actionPath}
              onChange={(event) => setActionPath(event.target.value)}
              maxLength={500}
              placeholder="/recurring"
              className="h-12 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-blue-500/60"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold text-zinc-300">
            Expiry <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="h-12 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500/60"
          />
          <span className="block text-[11px] text-muted-foreground">
            The banner disappears after this time. The notification remains in
            the user’s history.
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-4">
          <input
            type="checkbox"
            checked={sendPush}
            onChange={(event) => setSendPush(event.target.checked)}
            className="mt-0.5 size-4 accent-blue-600"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <BellRing className="size-4 text-blue-400" /> Send Web Push
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Only subscribed users whose notification preference allows
              important updates will receive it.
            </span>
          </span>
        </label>

        <AnnouncementPreview {...preview} />

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="size-4" />
          {busy ? "Publishing..." : `Review and publish to ${currentUserCount} users`}
        </button>
      </form>

      <section aria-labelledby="announcement-history-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="announcement-history-title" className="font-semibold">
              Announcement history
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The latest 50 published announcements
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {announcements.length} shown
          </span>
        </div>

        {announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.1] p-8 text-center text-sm text-muted-foreground">
            No announcements have been published yet.
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => {
              const status = announcementStatus(announcement);
              return (
                <article
                  key={announcement.id}
                  className="rounded-2xl border border-white/[0.08] bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CategoryBadge category={announcement.category as AnnouncementCategory} />
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <h3 className="mt-3 text-sm font-semibold leading-snug">
                        {announcement.title}
                      </h3>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {announcement.body}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {announcement.recipient_count} users
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{formatDateTime(announcement.published_at)}</span>
                    {announcement.send_push && <span>Web Push requested</span>}
                    {announcement.expires_at && (
                      <span>Expires {formatDateTime(announcement.expires_at)}</span>
                    )}
                  </div>

                  {!announcement.archived_at && (
                    <div className="mt-4 flex gap-2 border-t border-white/[0.06] pt-3">
                      {status.label === "Active" && (
                        <button
                          type="button"
                          disabled={updatingId === announcement.id}
                          onClick={() => void updateAnnouncement(announcement, "expire")}
                          className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                        >
                          <CalendarClock className="size-3.5" /> End now
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={updatingId === announcement.id}
                        onClick={() => void updateAnnouncement(announcement, "archive")}
                        className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50"
                      >
                        <Archive className="size-3.5" /> Archive
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function AnnouncementPreview({
  title,
  body,
  category,
}: {
  title: string;
  body: string;
  category: AnnouncementCategory;
}) {
  const Icon = categoryIcons[category];

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-600/[0.07] p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">
        Banner preview
      </p>
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: AnnouncementCategory }) {
  return (
    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
      {announcementCategoryLabels[category] ?? "Information"}
    </span>
  );
}

function announcementStatus(announcement: Announcement) {
  if (announcement.archived_at) {
    return { label: "Archived", className: "bg-zinc-500/10 text-zinc-400" };
  }

  if (
    announcement.expires_at &&
    new Date(announcement.expires_at).getTime() <= Date.now()
  ) {
    return { label: "Ended", className: "bg-amber-500/10 text-amber-300" };
  }

  return { label: "Active", className: "bg-emerald-500/10 text-emerald-300" };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
