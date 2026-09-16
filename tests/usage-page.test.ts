import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildUsageMetrics } from "../src/lib/usage/config.ts";

test("usage owner identity remains in server-only configuration", async () => {
  const access = await readFile("src/lib/usage/access.ts", "utf8");

  assert.match(access, /import "server-only"/);
  assert.match(access, /process\.env\.USAGE_OWNER_USER_ID/);
  assert.doesNotMatch(
    access,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});

test("usage metrics prefer live Supabase values while retaining Free-plan fallbacks", () => {
  const metrics = buildUsageMetrics([
    {
      metric: "DATABASE_SIZE",
      usage: 0.125,
      pricing_free_units: 0.5,
      capped: true,
    },
    {
      metric: "REALTIME_MESSAGE_COUNT",
      usage: "250000",
      pricing_free_units: "2000000",
    },
  ]);

  const database = metrics.find((metric) => metric.key === "DATABASE_SIZE");
  const realtime = metrics.find(
    (metric) => metric.key === "REALTIME_MESSAGE_COUNT",
  );
  const storage = metrics.find((metric) => metric.key === "STORAGE_SIZE");

  assert.deepEqual(
    {
      current: database?.current,
      limit: database?.limit,
      ratio: database?.ratio,
      capped: database?.capped,
    },
    { current: 0.125, limit: 0.5, ratio: 0.25, capped: true },
  );
  assert.equal(realtime?.ratio, 0.125);
  assert.equal(storage?.current, null);
  assert.equal(storage?.limit, 1);
});

test("usage route and sidebar both enforce the owner-only contract", async () => {
  const [page, accessRoute, menu, shell, serverUsage] = await Promise.all([
    readFile("src/app/usage/page.tsx", "utf8"),
    readFile("src/app/api/usage/access/route.ts", "utf8"),
    readFile("src/components/layout/app-menu.tsx", "utf8"),
    readFile("src/components/layout/app-route-shell.tsx", "utf8"),
    readFile("src/lib/usage/supabase-usage.ts", "utf8"),
  ]);

  assert.match(page, /if \(!isUsageOwner\(user\.id\)\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(menu, /href: "\/usage"/);
  assert.match(menu, /ownerOnly: true/);
  assert.match(menu, /fetch\("\/api\/usage\/access"/);
  assert.match(menu, /item\.ownerOnly \|\| canViewUsage/);
  assert.doesNotMatch(menu, /USAGE_OWNER_USER_ID/);
  assert.match(accessRoute, /isUsageOwner\(user\?\.id\)/);
  assert.match(accessRoute, /"Cache-Control": "private, no-store"/);
  assert.match(shell, /"\/usage"/);
  assert.match(serverUsage, /import "server-only"/);
  assert.match(serverUsage, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(serverUsage, /cache: "no-store"/);
});
