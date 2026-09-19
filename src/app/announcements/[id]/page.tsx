import { ChevronRight, Info, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppBackButton } from "@/components/layout/app-back-button";
import {
  announcementCategoryLabels,
  isAnnouncementCategory,
} from "@/lib/announcements";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

const categoryIcons = {
  new_feature: Sparkles,
  information: Info,
  maintenance: Wrench,
  urgent: TriangleAlert,
};

export default async function AnnouncementDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: announcement, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !announcement) {
    notFound();
  }

  const category = isAnnouncementCategory(announcement.category)
    ? announcement.category
    : "information";
  const Icon = categoryIcons[category];
  const status = announcement.archived_at
    ? "Archived"
    : announcement.expires_at
      ? "Time-limited"
      : "Published";

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-5 pb-10">
        <header className="sticky top-0 z-20 -mx-5 flex items-center gap-3 bg-background px-5 pb-3 pt-6">
          <AppBackButton fallbackHref="/notifications" label="Back to notifications" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">Announcement</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              SplitHutang update
            </p>
          </div>
        </header>

        <article className="mt-4 rounded-3xl border border-white/[0.08] bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              <Icon className="size-3.5" />
              {announcementCategoryLabels[category]}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              announcement.archived_at
                ? "bg-zinc-500/10 text-zinc-400"
                : "bg-emerald-500/10 text-emerald-300"
            }`}>
              {status}
            </span>
          </div>

          <h2 className="mt-5 text-2xl font-bold leading-tight">
            {announcement.title}
          </h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
            {announcement.body}
          </p>

          {announcement.action_path && announcement.action_label && (
            <Link
              href={announcement.action_path}
              className="mt-6 flex h-11 w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
            >
              {announcement.action_label}
              <ChevronRight className="size-4" />
            </Link>
          )}

          <div className="mt-6 border-t border-white/[0.06] pt-4 text-xs text-muted-foreground">
            Published {formatDateTime(announcement.published_at)}
            {announcement.expires_at && (
              <span className="mt-1 block">
                Scheduled to end {formatDateTime(announcement.expires_at)}
              </span>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(value));
}
