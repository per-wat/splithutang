import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { unzipSync, strFromU8 } from "fflate";

import * as validation from "../src/lib/tax-receipts/validation.ts";
import { parseReceiptInput, parseYear, TaxReceiptError, validateReceiptFile } from "../src/lib/tax-receipts/validation.ts";
import { malaysiaToday, parseMoney, type ReceiptInput, type TaxReceipt } from "../src/lib/tax-receipts/model.ts";
import * as rules from "../src/lib/tax-receipts/rules.ts";
import { assessReceipt, buildYearSummary, rulesVersionForYear, suggestKinds } from "../src/lib/tax-receipts/rules.ts";
import { createYearArchive, csvCell } from "../src/lib/tax-receipts/export.ts";

const owner = "94000000-0000-4000-8000-000000000001";
const other = "94000000-0000-4000-8000-000000000002";
const receiptId = "95000000-0000-4000-8000-000000000001";
const foreignId = "95000000-0000-4000-8000-000000000002";
const png = new Uint8Array([137,80,78,71,13,10,26,10,0]);
const base: ReceiptInput = {
  merchant: "Book shop", purchaseDate: "2026-03-10", totalCents: 50_000,
  answers: { resident: "yes", ownExpense: "yes", claimOnce: "yes" }, notes: "",
  items: [{ kind: "books", description: "Books", amountCents: 30_000, beneficiary: "self", conditionMet: "yes", parentResident: "unsure" }],
};
function receipt(patch: Partial<TaxReceipt> = {}): TaxReceipt {
  return { ...structuredClone(base), id: receiptId, assessmentYear: 2026, rulesVersion: "2026.1", fileMime: "image/png", fileSize: png.length, revision: 1, createdAt: "2026-03-11T00:00:00Z", deletedAt: null, ...patch };
}
function loadModule(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const execute = runInNewContext(`(function(require,exports){${code}\n})`, { console: { error() {} }, Date, Uint8Array, Response, Request, File, FormData, URL });
  execute((name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, exports);
  return exports;
}

test("money uses exact cents; receipt total and eligible portions remain separate", () => {
  assert.equal(parseMoney("123.45"), 12345);
  assert.equal(parseMoney("12.1"), 1210);
  for (const value of ["-1", "NaN", "1.005", "1e2", "1,000", "9999999"]) assert.equal(parseMoney(value), null);
  const parsed = parseReceiptInput(base, "2026-10-27");
  assert.equal(parsed.totalCents, 50000);
  assert.equal(assessReceipt(parsed, "2026.1")[0].eligibleCents, 30000);
  assert.throws(() => parseReceiptInput({ ...base, items: [...base.items, ...base.items] }, "2026-10-27"), /cannot add up/);
});

test("input validation rejects impossible dates, future dates, unsafe amounts and injected statuses", () => {
  for (const purchaseDate of ["2026-02-30", "2026-13-01", "2026-10-28", "1999-12-31", "bad"]) assert.throws(() => parseReceiptInput({ ...base, purchaseDate }, "2026-10-27"), TaxReceiptError);
  for (const totalCents of [0, -1, 0.1, Infinity, 1e10]) assert.throws(() => parseReceiptInput({ ...base, totalCents }, "2026-10-27"));
  assert.throws(() => parseReceiptInput({ ...base, answers: { resident: "admin" } }));
  const parsed = parseReceiptInput({ ...base, eligibleCents: 999999, status: "approved", userId: other }, "2026-10-27");
  assert.equal("eligibleCents" in parsed, false);
  assert.equal("userId" in parsed, false);
  assert.equal(malaysiaToday(new Date("2026-12-31T16:01:00Z")), "2027-01-01");
  assert.throws(() => parseYear("2026;drop"));
});

test("unverified years and unsupported purchases are needs-checking, never auto-ineligible", () => {
  for (const [year, version] of [[2024, "unreviewed"], [2025, "2026.1"], [2027, "unreviewed"]] as const) {
    const result = assessReceipt({ ...base, purchaseDate: `${year}-03-10` }, version)[0];
    assert.equal(result.status, "needs_checking"); assert.equal(result.eligibleCents, 0);
  }
  assert.equal(rulesVersionForYear(2025), "2025.1");
  for (const kind of ["unsure", "other"] as const) assert.equal(assessReceipt({ ...base, items: [{ ...base.items[0], kind }] }, "2026.1")[0].status, "needs_checking");
  assert.deepEqual(suggestKinds("new laptop and books"), ["device", "books"]);
});

test("eligibility checks do not promote uncertain or mismatched conditions", () => {
  for (const key of ["resident", "ownExpense", "claimOnce"] as const) {
    assert.equal(assessReceipt({ ...base, answers: { ...base.answers, [key]: "unsure" } }, "2026.1")[0].status, "needs_checking");
  }
  assert.equal(assessReceipt({ ...base, answers: { ...base.answers, resident: "no" } }, "2026.1")[0].status, "not_eligible");
  for (const patch of [{ beneficiary: "parent" }, { conditionMet: "no" }, { beneficiary: "other" }] as const) assert.equal(assessReceipt({ ...base, items: [{ ...base.items[0], ...patch }] }, "2026.1")[0].status, "not_eligible");
  const sportsParent = { ...base.items[0], kind: "sports_facility" as const, beneficiary: "parent" as const };
  assert.equal(assessReceipt({ ...base, items: [sportsParent] }, "2026.1")[0].status, "needs_checking");
  assert.equal(assessReceipt({ ...base, items: [{ ...sportsParent, parentResident: "yes" }] }, "2026.1")[0].status, "potentially_claimable");
});

test("yearly caps are shared across mixed receipts, exact and independent between years", () => {
  const first = receipt({ totalCents: 300000, items: [{ ...base.items[0], amountCents: 240000 }, { ...base.items[0], kind: "sports_facility", amountCents: 60000 }] });
  const second = receipt({ id: foreignId, purchaseDate: "2026-04-01", totalCents: 100000, items: [{ ...base.items[0], amountCents: 50000 }, { ...base.items[0], kind: "sports_facility", amountCents: 50000 }] });
  const summary = buildYearSummary([second, first, receipt({ assessmentYear: 2025, purchaseDate: "2025-01-01", rulesVersion: "2025.1" })], 2026);
  assert.equal(summary.totalCents, 400000); assert.equal(summary.eligibleCents, 400000); assert.equal(summary.estimatedClaimCents, 350000);
  assert.equal(summary.categories[0].excessCents, 40000); assert.equal(summary.categories[1].excessCents, 10000);
  assert.equal(summary.receipts[0].estimatedClaimCents, 300000); assert.equal(summary.receipts[1].estimatedClaimCents, 50000);
  assert.deepEqual(buildYearSummary([first, second], 2026), buildYearSummary([second, first], 2026));
  assert.equal(buildYearSummary([receipt({ deletedAt: "2026-04-01" })], 2026).estimatedClaimCents, 0);
});

test("a mixed receipt can have an eligible portion and unresolved items", () => {
  const mixed = receipt({ items: [...base.items, { ...base.items[0], kind: "other", amountCents: 10000 }] });
  const summary = buildYearSummary([mixed], 2026);
  assert.equal(summary.needsChecking, 1); assert.equal(summary.eligibleCents, 30000);
  assert.equal(summary.receipts[0].status, "needs_checking");
});

test("uploads enforce size, content signatures and supported MIME types", () => {
  validateReceiptFile(png, "image/png");
  validateReceiptFile(new TextEncoder().encode("%PDF-1.4 test"), "application/pdf");
  for (const mime of ["text/html", "image/svg+xml", "application/pdf", "image/jpeg"]) assert.throws(() => validateReceiptFile(png, mime));
  assert.throws(() => validateReceiptFile(new Uint8Array(3 * 1024 * 1024 + 1), "image/png"));
  assert.throws(() => validateReceiptFile(new Uint8Array(), "image/png"));
});

test("ZIP includes originals, matching index and safely escaped spreadsheet fields", async () => {
  const current = receipt({ merchant: "=HYPERLINK(\"bad\")", notes: "\t=evil" });
  const unknown = receipt({ id: foreignId, items: [{ ...base.items[0], kind: "other" }] });
  const loadIds: string[] = [];
  const stream = createYearArchive([current, unknown], 2026, "all", async (id) => { loadIds.push(id); return { bytes: png }; });
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const files = unzipSync(bytes);
  assert.equal(loadIds.length, 2);
  assert.equal(Object.keys(files).length, 6);
  const index = strFromU8(files["receipt-index.csv"]);
  assert.match(index, /Receipt total/); assert.match(index, /Eligible before annual limit/);
  assert.match(index, /'=HYPERLINK/); assert.match(index, /'\t=evil/);
  assert.match(strFromU8(files["summary.csv"]), /300.00/);
  for (const filename of Object.keys(files).filter((name) => name.startsWith("receipts/"))) assert.deepEqual(files[filename], png);
  const claimFiles = unzipSync(new Uint8Array(await new Response(createYearArchive([current, unknown], 2026, "claims", async () => ({ bytes: png }))).arrayBuffer()));
  assert.equal(Object.keys(claimFiles).length, 5);
  for (const value of ["=formula", " +formula", "@formula", "\n=bad"]) assert.match(csvCell(value), /^"'/);
});

test("ZIP fails instead of silently omitting a missing receipt and supports cancellation", async () => {
  await assert.rejects(new Response(createYearArchive([receipt()], 2026, "all", async () => { throw new Error("missing file"); })).arrayBuffer(), /incomplete archive/);
  let loads = 0;
  const stream = createYearArchive([receipt()], 2026, "all", async () => { loads++; return { bytes: png }; });
  await stream.cancel();
  assert.equal(loads, 0);
});

function storeHarness(userId: string | null, granted = true) {
  let adminCalls = 0; let downloads = 0; let removals = 0; let removalError = false;
  const asRow = (id: string, user: string) => ({ id, user_id: user, merchant: base.merchant, purchase_date: base.purchaseDate, assessment_year: 2026, total_cents: base.totalCents, items: base.items, answers: base.answers, rules_version: "2026.1", notes: "", file_path: `${user}/${id}/receipt.png`, file_mime: "image/png", file_size: png.length, file_sha256: crypto.createHash("sha256").update(png).digest("hex"), revision: 1, deleted_at: null, created_at: "2026-03-11" });
  const rows: Record<string, unknown>[] = [asRow(receiptId, owner), asRow(foreignId, other)];
  function query() {
    let operation = "select"; let patch: Record<string, unknown> = {}; const filters: ((row: Record<string, unknown>) => boolean)[] = []; let single = false; let range = [0, 1000];
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return builder; },
      is(key: string, value: unknown) { return builder.eq(key, value); },
      not(key: string, _operator: string, value: unknown) { filters.push((row) => row[key] !== value); return builder; },
      update(value: Record<string, unknown>) { operation = "update"; patch = value; return builder; },
      delete() { operation = "delete"; return builder; },
      insert(value: Record<string, unknown>) { operation = "insert"; patch = value; return builder; },
      order() { return builder; }, range(from: number, to: number) { range = [from, to]; return builder; },
      maybeSingle() { single = true; return builder; }, single() { single = true; return builder; },
      then(resolve: (value: unknown) => unknown) {
        let found = rows.filter((row) => filters.every((filter) => filter(row))).slice(range[0], range[1] + 1);
        if (operation === "update") found.forEach((row) => Object.assign(row, patch));
        if (operation === "delete") found.forEach((row) => rows.splice(rows.indexOf(row), 1));
        if (operation === "insert") { const inserted = { ...patch, assessment_year: Number(String(patch.purchase_date).slice(0, 4)), revision: 1, deleted_at: null, created_at: "2026-03-11" }; rows.push(inserted); found = [inserted]; }
        return Promise.resolve(resolve({ data: single ? found[0] ?? null : found, error: null }));
      },
    };
    return builder;
  }
  const exports = loadModule("src/lib/tax-receipts/server.ts", {
    "server-only": {}, "node:crypto": crypto,
    "@/lib/features/server": { getFeatureAccess: async () => ({ user: userId ? { id: userId } : null, featureKeys: granted ? ["tax_receipts"] : [] }) },
    "@/lib/supabase/admin": { createAdminClient: () => { adminCalls++; return { from: query, storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => { downloads++; return { data: new Blob([png]), error: null }; }, remove: async () => { removals++; return { error: removalError ? new Error("storage unavailable") : null }; } }) } }; } },
    "@/lib/tax-receipts/rules": rules,
    "@/lib/tax-receipts/validation": validation,
  });
  return { open: exports.openTaxReceiptStore as unknown as () => Promise<{
    list: (year: number) => Promise<TaxReceipt[]>; get: (id: string) => Promise<TaxReceipt>;
    update: (id: string, input: ReceiptInput, revision: number) => Promise<TaxReceipt>;
    file: (id: string) => Promise<{ bytes: Uint8Array }>; remove: (id: string) => Promise<void>;
    create: (input: ReceiptInput, bytes: Uint8Array, mime: string) => Promise<TaxReceipt>;
  }>, get adminCalls() { return adminCalls; }, get downloads() { return downloads; }, get removals() { return removals; }, setRemovalError(value: boolean) { removalError = value; }, rows };
}

test("unauthenticated or revoked users cannot construct a privileged receipt store", async () => {
  for (const harness of [storeHarness(null), storeHarness(owner, false)]) {
    await assert.rejects(harness.open(), TaxReceiptError);
    assert.equal(harness.adminCalls, 0);
  }
});

test("creator and granted users can access only their own rows and originals", async () => {
  for (const [userId, ownId, otherId] of [[owner, receiptId, foreignId], [other, foreignId, receiptId]]) {
    const harness = storeHarness(userId); const store = await harness.open();
    assert.equal((await store.list(2026)).length, 1);
    assert.equal((await store.get(ownId)).id, ownId);
    await assert.rejects(store.get(otherId), /not found/);
    await assert.rejects(store.file(otherId), /not found/);
    await assert.rejects(store.update(otherId, base, 1), /not found/);
    await assert.rejects(store.remove(otherId), /not found/);
    assert.equal(harness.downloads, 0); assert.equal(harness.removals, 0);
    assert.deepEqual((await store.file(ownId)).bytes, png);
  }
});

test("duplicate uploads, stale edits and altered paths fail closed; deletion removes the file", async () => {
  const harness = storeHarness(owner); const store = await harness.open();
  await assert.rejects(store.create(base, png, "image/png"), /already saved/);
  await assert.rejects(store.update(receiptId, base, 9), /another tab/);
  const updated = await store.update(receiptId, { ...base, totalCents: 60000 }, 1);
  assert.equal(updated.revision, 2); assert.equal(updated.totalCents, 60000);
  const own = harness.rows.find((row) => row.id === receiptId)!;
  own.file_path = `${other}/${foreignId}/receipt.png`;
  await assert.rejects(store.file(receiptId), /path needs checking/);
  assert.equal(harness.downloads, 0);
  own.file_path = `${owner}/${receiptId}/receipt.png`;
  await store.remove(receiptId);
  assert.equal(harness.removals, 1); assert.equal((await store.list(2026)).length, 0);
});

test("all receipt API methods enforce feature access before parsing or doing work", async () => {
  const paths = [
    ["src/app/api/tax-receipts/route.ts", ["GET", "POST"]],
    ["src/app/api/tax-receipts/[id]/route.ts", ["PATCH", "DELETE"]],
    ["src/app/api/tax-receipts/[id]/file/route.ts", ["GET"]],
    ["src/app/api/tax-receipts/export/route.ts", ["GET"]],
  ] as const;
  for (const status of [401, 403]) for (const [path, methods] of paths) {
    const handlers = loadModule(path, {
      "@/lib/tax-receipts/server": { openTaxReceiptStore: async () => { throw new TaxReceiptError("Access denied", status); } },
      "@/lib/tax-receipts/rules": rules,
      "@/lib/tax-receipts/validation": validation,
      "@/lib/tax-receipts/export": { createYearArchive() { throw new Error("must not run"); } },
      "@/lib/tax-receipts/http": { privateHeaders: { "Cache-Control": "private, no-store" }, taxError: (error: unknown) => Response.json({ error: (error as TaxReceiptError).message }, { status: (error as TaxReceiptError).status }) },
    });
    for (const method of methods) {
      const response = await handlers[method](new Request("https://example.test/api/tax-receipts?year=2026"), { params: Promise.resolve({ id: foreignId }) }) as Response;
      assert.equal(response.status, status);
    }
  }
});

test("year listing fetches beyond a single PostgREST page", async () => {
  const harness = storeHarness(owner);
  const seed = harness.rows[0];
  for (let i = 1; i <= 501; i++) harness.rows.push({ ...seed, id: `row-${i}` });
  const store = await harness.open();
  assert.equal((await store.list(2026)).length, 502);
});


test("failed file deletion remains pending, blocks downloads, and can be retried", async () => {
  const harness = storeHarness(owner); const store = await harness.open();
  harness.setRemovalError(true);
  await assert.rejects(store.remove(receiptId), /Deletion is pending/);
  const pending = await store.list(2026);
  assert.ok(pending[0].deletedAt);
  assert.equal(buildYearSummary(pending, 2026).estimatedClaimCents, 0);
  await assert.rejects(store.file(receiptId), /not found/);
  harness.setRemovalError(false);
  await store.remove(receiptId);
  assert.equal((await store.list(2026)).length, 0);
});
