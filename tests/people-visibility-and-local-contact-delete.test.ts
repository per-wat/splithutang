import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260912072742_fix_people_visibility_and_local_contact_delete.sql",
);

const PERSON_PAGE_PATH = path.join(
  process.cwd(),
  "src/app/people/[id]/page.tsx",
);

const DELETE_ACTION_PATH = path.join(
  process.cwd(),
  "src/components/people/delete-local-contact-action.tsx",
);

test("People and new-group lists only inherit active group relationships", async () => {
  const migration = await readFile(MIGRATION_PATH, "utf8");

  const peopleFunction = migration.slice(
    migration.indexOf("public.get_people_balances()"),
    migration.indexOf("public.get_group_member_candidates()"),
  );
  const candidateFunction = migration.slice(
    migration.indexOf("public.get_group_member_candidates()"),
    migration.indexOf("public.delete_local_contact("),
  );

  assert.equal(
    peopleFunction.match(/gm\.membership_status = 'active'/g)?.length,
    2,
  );
  assert.equal(
    candidateFunction.match(/gm\.membership_status = 'active'/g)?.length,
    2,
  );
});

test("local contact deletion is guarded by ownership, identity, membership and history", async () => {
  const migration = await readFile(MIGRATION_PATH, "utf8");

  assert.match(
    migration,
    /create or replace function public\.delete_local_contact/,
  );
  assert.match(migration, /p\.owner_id = v_user_id/);
  assert.match(migration, /v_linked_user_id is not null/);
  assert.match(migration, /gm\.membership_status = 'active'/);
  assert.match(migration, /public\.expense_participants/);
  assert.match(migration, /public\.expense_payments/);
  assert.match(migration, /public\.ious/);
  assert.match(migration, /public\.iou_payments/);
  assert.match(
    migration,
    /revoke delete on table public\.people from authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.delete_local_contact\(uuid\) to authenticated/,
  );
});

test("delete control is shown only for a local contact owned by the user", async () => {
  const [page, action] = await Promise.all([
    readFile(PERSON_PAGE_PATH, "utf8"),
    readFile(DELETE_ACTION_PATH, "utf8"),
  ]);

  assert.match(page, /target\.owner_id === user\.id/);
  assert.match(page, /target\.linked_user_id === null/);
  assert.match(page, /isOwnedLocalContact &&/);
  assert.match(action, /\.rpc\("delete_local_contact"/);
  assert.match(action, /router\.replace\("\/people"\)/);
});
