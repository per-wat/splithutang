import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseAnnouncementPublishInput } from "../src/lib/announcements.ts";
import { shouldDeliverPush } from "../src/lib/notifications/rules.ts";
import { notificationPath } from "../src/lib/notifications/types.ts";

const now = new Date("2026-09-19T04:00:00.000Z");

test("announcement input is normalized for safe server publishing", () => {
  const result = parseAnnouncementPublishInput(
    {
      title: "  New recurring payments  ",
      body: "  You can now track subscriptions.  ",
      category: "new_feature",
      actionLabel: "  Try it  ",
      actionPath: "  /recurring  ",
      expiresAt: "2026-09-20T04:00:00.000Z",
      sendPush: true,
    },
    now,
  );

  assert.deepEqual(result, {
    ok: true,
    data: {
      title: "New recurring payments",
      body: "You can now track subscriptions.",
      category: "new_feature",
      actionLabel: "Try it",
      actionPath: "/recurring",
      expiresAt: "2026-09-20T04:00:00.000Z",
      sendPush: true,
    },
  });
});

test("announcement links stay inside the app and expiry stays in the future", () => {
  const base = {
    title: "Maintenance",
    body: "We will be back shortly.",
    category: "maintenance",
    actionLabel: "Details",
    sendPush: false,
  };

  assert.equal(
    parseAnnouncementPublishInput(
      { ...base, actionPath: "https://example.com", expiresAt: null },
      now,
    ).ok,
    false,
  );
  assert.equal(
    parseAnnouncementPublishInput(
      { ...base, actionPath: "/settings", expiresAt: now.toISOString() },
      now,
    ).ok,
    false,
  );
  assert.equal(
    parseAnnouncementPublishInput(
      { ...base, actionLabel: null, actionPath: "/settings", expiresAt: null },
      now,
    ).ok,
    false,
  );
});

test("announcements route to their detail and respect existing push preferences", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(notificationPath("announcement", id), `/announcements/${id}`);
  assert.equal(shouldDeliverPush("in_app_only", "announcement_published"), false);
  assert.equal(shouldDeliverPush("payments_only", "announcement_published"), false);
  assert.equal(shouldDeliverPush("all_important", "announcement_published"), true);
});

test("publishing is owner-only and uses a server-side transactional fan-out", async () => {
  const [access, publishRoute, manageRoute, migration] = await Promise.all([
    readFile("src/lib/usage/access.ts", "utf8"),
    readFile("src/app/api/announcements/route.ts", "utf8"),
    readFile("src/app/api/announcements/[id]/route.ts", "utf8"),
    readFile(
      "supabase/migrations/20260919041019_owner_announcements.sql",
      "utf8",
    ),
  ]);

  assert.match(access, /import "server-only"/);
  assert.match(access, /process\.env\.USAGE_OWNER_USER_ID/);
  assert.match(publishRoute, /isAppOwner\(user\.id\)/);
  assert.match(manageRoute, /isAppOwner\(user\.id\)/);
  assert.match(publishRoute, /createAdminClient\(\)/);
  assert.match(migration, /alter table public\.announcements enable row level security/i);
  assert.match(migration, /grant select on public\.announcements to authenticated/i);
  assert.doesNotMatch(migration, /grant insert on public\.announcements to authenticated/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /grant execute on function public\.publish_announcement[\s\S]*to service_role/i);
  assert.match(migration, /from public\.profiles recipient/i);
  assert.match(migration, /insert into public\.notification_push_outbox/i);
});

test("the owner menu, global banner and management safeguards are wired", async () => {
  const [menu, shell, manager, detail] = await Promise.all([
    readFile("src/components/layout/app-menu.tsx", "utf8"),
    readFile("src/components/layout/app-shell.tsx", "utf8"),
    readFile(
      "src/components/announcements/announcement-manager.tsx",
      "utf8",
    ),
    readFile("src/app/announcements/[id]/page.tsx", "utf8"),
  ]);

  assert.match(menu, /href: "\/announcements"/);
  assert.match(menu, /label: "Announcements"[\s\S]*ownerOnly: true/);
  assert.match(shell, /<AnnouncementBanner/);
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /Send Web Push/);
  assert.match(manager, /End now/);
  assert.match(manager, /Archive/);
  assert.match(detail, /fallbackHref="\/notifications"/);
});
