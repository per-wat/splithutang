import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { RECEIPT_OCR_ASSET_PATHS } from "../src/lib/receipts/run-receipt-ocr.ts";

const REQUIRED_RUNTIME_FILES = [
  `${RECEIPT_OCR_ASSET_PATHS.workerPath}`,
  `${RECEIPT_OCR_ASSET_PATHS.corePath}/tesseract-core-lstm.wasm.js`,
  `${RECEIPT_OCR_ASSET_PATHS.corePath}/tesseract-core-simd-lstm.wasm.js`,
  `${RECEIPT_OCR_ASSET_PATHS.corePath}/tesseract-core-relaxedsimd-lstm.wasm.js`,
  `${RECEIPT_OCR_ASSET_PATHS.langPath}/eng.traineddata.gz`,
];

test("receipt OCR uses same-origin runtime assets", () => {
  for (const assetPath of Object.values(RECEIPT_OCR_ASSET_PATHS)) {
    assert.match(assetPath, /^\/tesseract\/7\.0\.0(?:\/|$)/);
    assert.doesNotMatch(assetPath, /^https?:\/\//);
  }
});

test("all receipt OCR runtime assets are present", async () => {
  for (const assetPath of REQUIRED_RUNTIME_FILES) {
    const filePath = path.join(process.cwd(), "public", assetPath);
    const fileStat = await stat(filePath);

    assert.equal(fileStat.isFile(), true, `${assetPath} must be a file`);
    assert.ok(fileStat.size > 0, `${assetPath} must not be empty`);
  }
});
