import Link from "next/link";
import { Archive, ChevronRight, Plus, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function GroupsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: groups, error } = await supabase.rpc("get_groups_overview");

  if (error) {
    console.error("Unable to load groups:", error);

    throw new Error("Unable to load groups");
  }

  const activeGroups = (groups ?? []).filter((group) => !group.archived_at);

  const archivedGroups = (groups ?? []).filter((group) =>
    Boolean(group.archived_at),
  );

  return (
    <AppShell>
      <header className="px-5 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight">
              Groups
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Manage who you split with
            </p>
          </div>

          <Link
            href="/groups/new"
            aria-label="Create group"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition-transform active:scale-95"
          >
            <Plus className="size-5" />
          </Link>
        </div>
      </header>

      <section className="px-5 pb-8 pt-6">
        {/* Active */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Active
          </h2>

          {activeGroups.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-card p-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-600/10">
                <UsersRound className="size-5 text-blue-400" />
              </div>

              <p className="mt-4 font-semibold">No active groups</p>

              <p className="mt-1 text-sm text-muted-foreground">
                Create a group to start splitting expenses.
              </p>

              <Link
                href="/groups/new"
                className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
              >
                Create Group
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeGroups.map((group) => (
                <Link
                  key={group.group_id}
                  href={`/groups/${group.group_id}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-card p-4 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10">
                    <UsersRound className="size-5 text-blue-400" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{group.name}</p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.member_count}{" "}
                      {group.member_count === 1 ? "member" : "members"}
                      {" · "}
                      {group.is_owner ? "Owner" : "Member"}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Debtor self-confirm:{" "}
                      <span
                        className={
                          group.allow_debtor_self_confirm
                            ? "text-emerald-400"
                            : ""
                        }
                      >
                        {group.allow_debtor_self_confirm ? "On" : "Off"}
                      </span>
                    </p>
                  </div>

                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Archived */}
        {archivedGroups.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Archived
            </h2>

            <div className="space-y-3">
              {archivedGroups.map((group) => (
                <Link
                  key={group.group_id}
                  href={`/groups/${group.group_id}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-card/60 p-4 opacity-80 transition-colors hover:opacity-100"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05]">
                    <Archive className="size-5 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{group.name}</p>

                      <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Archived
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.member_count}{" "}
                      {group.member_count === 1
                        ? "active member"
                        : "active members"}
                      {" · "}
                      {group.is_owner ? "Owner" : "Member"}
                    </p>
                  </div>

                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
