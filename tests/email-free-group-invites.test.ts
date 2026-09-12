import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260912081304_email_free_one_time_group_invites.sql",
);

const MANAGER_PATH = path.join(
  process.cwd(),
  "src/components/groups/group-invite-manager.tsx",
);

const INVITE_PAGE_PATH = path.join(
  process.cwd(),
  "src/app/invite/[token]/page.tsx",
);

test("new group invitations are email-free and expire through the existing lifecycle", async () => {
  const migration = await readFile(MIGRATION_PATH, "utf8");

  assert.match(migration, /alter column email drop not null/);
  assert.match(
    migration,
    /create or replace function public\.create_group_invite\(\s*p_group_id uuid,\s*p_person_id uuid\s*\)/,
  );
  assert.match(migration, /set email = null/);
  assert.match(
    migration,
    /revoke all\s+on function public\.create_group_invite\(uuid, uuid, text\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute\s+on function public\.create_group_invite\(uuid, uuid, text\)\s+to authenticated/,
  );
});

test("claiming remains atomic, authenticated and single-use", async () => {
  const migration = await readFile(MIGRATION_PATH, "utf8");

  assert.match(
    migration,
    /alter function public\.claim_group_invite\(uuid\)\s+rename to claim_group_invite_email_bound/,
  );
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /where gi\.token = p_token\s+for update/);
  assert.match(
    migration,
    /v_group_id := public\.claim_group_invite_email_bound\(p_token\)/,
  );
  assert.match(
    migration,
    /grant execute\s+on function public\.claim_group_invite\(uuid\)\s+to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute\s+on function public\.claim_group_invite_email_bound/,
  );
});

test("invite UI needs only a local contact and explains link ownership", async () => {
  const [manager, invitePage] = await Promise.all([
    readFile(MANAGER_PATH, "utf8"),
    readFile(INVITE_PAGE_PATH, "utf8"),
  ]);

  assert.doesNotMatch(manager, /id="invite-email"/);
  assert.doesNotMatch(manager, /p_email:/);
  assert.match(manager, /expires in 7 days/);
  assert.match(manager, /can only be claimed once/);
  assert.match(invitePage, /Only continue if/);
  assert.match(invitePage, /This link can only be claimed once/);
});
