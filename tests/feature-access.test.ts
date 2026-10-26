import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

import { parseFeatureAccessChange, resolveFeatureKeys } from "../src/lib/features/catalog.ts";
import * as catalog from "../src/lib/features/catalog.ts";

const ownerId = "90000000-0000-4000-8000-000000000001";
const memberId = "90000000-0000-4000-8000-000000000002";

// Execute the real server modules with boundary dependencies injected. This
// exercises handler authorization and responses without credentials/network.
function loadModule(path: string, dependencies: Record<string, unknown>): Record<string, (...args: never[]) => Promise<Response>> {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const execute = runInNewContext(`(function(require, exports) { ${code}\n})`, {
    URL, Response, Request, Date, console: { error() {} },
  });
  execute((name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

function adminHarness(userId: string | null) {
  let adminCalls = 0;
  let targetExists = true;
  let writeError: unknown = null;
  let searchError: unknown = null;
  let saved: Record<string, unknown> | null = null;
  let searchArgs: unknown = null;
  const rows = Array.from({ length: 21 }, (_, index) => ({
    user_id: String(index), display_name: `User ${index}`, email: `user${index}@example.test`,
    enabled_feature_keys: ["tax_receipts", "unknown_feature"],
  }));
  const admin = {
    rpc: async (_name: string, args: unknown) => { searchArgs = args; return { data: rows, error: searchError }; },
    from: (table: string) => table === "profiles" ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: targetExists ? { id: memberId } : null, error: null }) }) }),
    } : {
      upsert: async (value: Record<string, unknown>) => { saved = value; return { error: writeError }; },
    },
  };
  const handlers = loadModule("src/app/api/admin/feature-access/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/features/catalog": catalog,
    "@/lib/supabase/admin": { createAdminClient: () => { adminCalls++; return admin; } },
    "@/lib/supabase/auth": { getVerifiedUser: async () => userId ? { id: userId } : null },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/usage/access": { isAppOwner: (id: string) => id === ownerId },
  });
  return {
    get: (url = "https://example.test/api/admin/feature-access") => handlers.GET(new Request(url) as never),
    patch: (body: unknown) => handlers.PATCH(new Request("https://example.test/api/admin/feature-access", {
      method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    }) as never),
    get adminCalls() { return adminCalls; },
    get saved() { return saved; },
    get searchArgs() { return searchArgs; },
    missingTarget() { targetExists = false; },
    failWrite() { writeError = new Error("database unavailable"); },
    failSearch() { searchError = new Error("database unavailable"); },
  };
}

test("feature permissions default off, ignore unknown keys, and preserve creator access", () => {
  assert.deepEqual(resolveFeatureKeys(false, []), []);
  assert.deepEqual(resolveFeatureKeys(false, [{ feature_key: "tax_receipts", enabled: false }]), []);
  assert.deepEqual(resolveFeatureKeys(false, [{ feature_key: "unknown", enabled: true }]), []);
  assert.deepEqual(resolveFeatureKeys(false, [{ feature_key: "tax_receipts", enabled: true }]), ["tax_receipts"]);
  assert.deepEqual(resolveFeatureKeys(true, [{ feature_key: "tax_receipts", enabled: false }]), ["tax_receipts"]);
});

test("grant input rejects malformed IDs, unknown features and non-boolean settings", () => {
  const valid = { userId: memberId, featureKey: "tax_receipts", enabled: true };
  for (const invalid of [null, [], {}, { ...valid, userId: "bad" }, { ...valid, featureKey: "admin" }, { ...valid, enabled: "true" }]) {
    assert.equal(parseFeatureAccessChange(invalid).ok, false);
  }
  assert.deepEqual(parseFeatureAccessChange(valid), { ok: true, ...valid });
  assert.deepEqual(parseFeatureAccessChange({ ...valid, enabled: false }), { ok: true, ...valid, enabled: false });
});

test("signed-out and ordinary users cannot search users or grant themselves access", async () => {
  for (const [user, expected] of [[null, 401], [memberId, 404]] as const) {
    const harness = adminHarness(user);
    assert.equal((await harness.get()).status, expected);
    assert.equal((await harness.patch({ userId: memberId, featureKey: "tax_receipts", enabled: true })).status, expected);
    assert.equal(harness.adminCalls, 0);
    assert.equal(harness.saved, null);
  }
});

test("owner search is paginated, uncached and filters unknown feature keys", async () => {
  const harness = adminHarness(ownerId);
  const response = await harness.get("https://example.test/api/admin/feature-access?query=user%40example.test&page=2");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const result = await response.json();
  assert.equal(result.users.length, 20);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.users[0].featureKeys, ["tax_receipts"]);
  assert.equal(JSON.stringify(harness.searchArgs), JSON.stringify({ p_query: "user@example.test", p_offset: 40, p_limit: 21 }));
  for (const page of ["-1", "0.5", "NaN", "10001"]) {
    assert.equal((await harness.get(`https://example.test/api/admin/feature-access?page=${page}`)).status, 400);
  }
  assert.equal((await harness.get(`https://example.test/api/admin/feature-access?query=${"a".repeat(101)}`)).status, 400);
  harness.failSearch();
  assert.equal((await harness.get()).status, 503);
});

test("owner grants and revokes one feature, with server-controlled audit identity", async () => {
  const harness = adminHarness(ownerId);
  for (const enabled of [true, false]) {
    assert.equal((await harness.patch({ userId: memberId, featureKey: "tax_receipts", enabled, updated_by: memberId })).status, 200);
    assert.equal(harness.saved?.user_id, memberId);
    assert.equal(harness.saved?.enabled, enabled);
    assert.equal(harness.saved?.updated_by, ownerId);
  }
  assert.equal((await harness.patch({ userId: ownerId, featureKey: "tax_receipts", enabled: false })).status, 400);
  assert.equal((await harness.patch({ userId: memberId, featureKey: "admin", enabled: true })).status, 400);
  harness.missingTarget();
  assert.equal((await harness.patch({ userId: memberId, featureKey: "tax_receipts", enabled: true })).status, 404);
});

test("write failure is reported instead of acknowledging an unsaved grant", async () => {
  const harness = adminHarness(ownerId);
  harness.failWrite();
  const response = await harness.patch({ userId: memberId, featureKey: "tax_receipts", enabled: true });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Unable to save/);
});

test("live feature checks enforce revocation, fail closed, and guard direct page access", async () => {
  let currentUser: { id: string } | null = { id: memberId };
  let enabled = true;
  let databaseError = false;
  let reads = 0;
  const query = {
    select() { return query; },
    eq() { return query; },
    then(resolve: (value: unknown) => unknown) {
      reads++;
      return Promise.resolve(resolve({ data: [{ feature_key: "tax_receipts", enabled }], error: databaseError ? new Error("outage") : null }));
    },
  };
  const server = loadModule("src/lib/features/server.ts", {
    "server-only": {},
    "next/navigation": { notFound() { throw new Error("404"); }, redirect() { throw new Error("login"); } },
    "@/lib/features/catalog": catalog,
    "@/lib/supabase/auth": { getVerifiedUser: async () => currentUser },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "@/lib/usage/access": { isAppOwner: (id: string) => id === ownerId },
  }) as unknown as {
    getFeatureAccess: () => Promise<{ user: unknown; featureKeys: string[] }>;
    requireFeatureAccess: (key: string) => Promise<unknown>;
  };
  assert.equal(JSON.stringify((await server.getFeatureAccess()).featureKeys), '["tax_receipts"]');
  await server.requireFeatureAccess("tax_receipts");
  enabled = false;
  assert.equal(JSON.stringify((await server.getFeatureAccess()).featureKeys), "[]");
  await assert.rejects(server.requireFeatureAccess("tax_receipts"), /404/);
  databaseError = true;
  await assert.rejects(server.getFeatureAccess(), /Unable to check/);
  currentUser = { id: ownerId };
  const previousReads = reads;
  await server.requireFeatureAccess("tax_receipts");
  assert.equal(reads, previousReads);
  currentUser = null;
  await assert.rejects(server.requireFeatureAccess("tax_receipts"), /login/);
  await assert.rejects(server.requireFeatureAccess("unknown"), /404/);
});


test("own-access API never accepts a target user and fails closed on lookup errors", async () => {
  let currentUser: { id: string } | null = null;
  let fail = false;
  const handlers = loadModule("src/app/api/features/access/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/features/server": { getFeatureAccess: async () => {
      if (fail) throw new Error("unavailable");
      return { user: currentUser, featureKeys: [] };
    } },
  });
  assert.equal((await handlers.GET()).status, 401);
  currentUser = { id: memberId };
  const response = await handlers.GET(new Request(`https://example.test/api/features/access?userId=${ownerId}`) as never);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { featureKeys: [] });
  fail = true;
  assert.equal((await handlers.GET()).status, 503);
});

test("direct admin page access checks the session and creator identity before rendering", async () => {
  let currentUser: { id: string } | null = null;
  const page = loadModule("src/app/feature-access/page.tsx", {
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
    "next/navigation": { notFound() { throw new Error("404"); }, redirect() { throw new Error("login"); } },
    "@/components/features/feature-access-manager": { FeatureAccessManager: "manager" },
    "@/components/layout/app-back-button": { AppBackButton: "back" },
    "@/components/layout/app-menu": { AppMenu: "menu" },
    "@/lib/supabase/auth": { getVerifiedUser: async () => currentUser },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/usage/access": { isAppOwner: (id: string) => id === ownerId },
  });
  await assert.rejects(page.default(), /login/);
  currentUser = { id: memberId };
  await assert.rejects(page.default(), /404/);
  currentUser = { id: ownerId };
  assert.ok(await page.default());
});
