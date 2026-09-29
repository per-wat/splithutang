import assert from "node:assert/strict";
import test from "node:test";

import { calculateInstallment } from "../src/lib/installment-calculator.ts";
import { getParentRoute } from "../src/lib/navigation.ts";

test("flat annual profit and final payment reconcile to the cent", () => {
  const result = calculateInstallment(1_000, 12, 9);
  assert.deepEqual(result, {
    principalCents: 100_000,
    profitCents: 9_000,
    totalCents: 109_000,
    monthlyCents: 9_083,
    finalCents: 9_087,
  });
});

test("rounding can make the final payment smaller than earlier payments", () => {
  const result = calculateInstallment(1_000, 18, 9);
  assert.equal(result?.profitCents, 13_500);
  assert.equal(result?.monthlyCents, 6_306);
  assert.equal(result?.finalCents, 6_298);
  assert.equal((result?.monthlyCents ?? 0) * 17 + (result?.finalCents ?? 0), result?.totalCents);
});

test("zero rate, one month, and minimum amount work", () => {
  assert.equal(calculateInstallment(0.01, 1, 0)?.finalCents, 1);
  assert.equal(calculateInstallment(50, 12, 0)?.profitCents, 0);
});

test("invalid or unsafe inputs never produce a payment", () => {
  for (const args of [
    [0, 12, 9], [10.001, 12, 9], [10, 0, 9], [10, 12.5, 9],
    [10, 601, 9], [10, 12, -1], [10, 12, 101], [Infinity, 12, 9],
  ]) {
    assert.equal(calculateInstallment(...(args as [number, number, number])), null);
  }
});

test("calculator Back returns home", () => {
  assert.equal(getParentRoute("/installment-calculator"), "/");
});
