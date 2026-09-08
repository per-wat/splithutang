import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const PEOPLE_PAGE_PATH = path.join(
  process.cwd(),
  "src/app/people/page.tsx",
);
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260909070000_include_people_avatar_path.sql",
);

test("People page gets balances and avatar data in one RPC", async () => {
  const source = await readFile(PEOPLE_PAGE_PATH, "utf8");

  assert.equal(
    source.match(/\.rpc\("get_people_balances"\)/g)?.length,
    1,
  );
  assert.doesNotMatch(source, /\.from\("people"\)/);
  assert.match(source, /person\.avatar_color/);
  assert.match(source, /person\.avatar_path/);
});

test("People balance RPC returns both avatar fields", async () => {
  const migration = await readFile(MIGRATION_PATH, "utf8");

  assert.match(migration, /avatar_color text/);
  assert.match(migration, /avatar_path text/);
  assert.match(migration, /vp\.avatar_color/);
  assert.match(migration, /vp\.avatar_path/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});
