import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const NEW_GROUP_PAGE = path.join(
  process.cwd(),
  "src/app/groups/new/page.tsx",
);
const NEW_GROUP_LOADING = path.join(
  process.cwd(),
  "src/app/groups/new/loading.tsx",
);
const CANDIDATES_MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260909080000_get_group_member_candidates.sql",
);

test("new-group page uses verified claims and the bounded candidate RPC", async () => {
  const source = await readFile(NEW_GROUP_PAGE, "utf8");

  assert.match(source, /getVerifiedUser\(supabase\)/);
  assert.match(source, /\.rpc\(\s*"get_group_member_candidates"/);
  assert.doesNotMatch(source, /auth\.getUser\(\)/);
  assert.doesNotMatch(source, /\.from\("people"\)/);
});

test("candidate RPC is authenticated, set based and excludes the current user", async () => {
  const migration = await readFile(CANDIDATES_MIGRATION, "utf8");

  assert.match(migration, /security definer/);
  assert.match(migration, /p\.owner_id = me\.user_id/);
  assert.match(migration, /gm\.membership_status = 'active'/);
  assert.match(migration, /person\.id is distinct from me\.person_id/);
  assert.doesNotMatch(migration, /private\.can_view_person/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("new-group route has an immediate loading fallback", async () => {
  const source = await readFile(NEW_GROUP_LOADING, "utf8");

  assert.match(source, /Loading new group form/);
  assert.match(source, /aria-busy="true"/);
  assert.match(source, /New Group/);
});
