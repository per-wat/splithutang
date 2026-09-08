# Local Tesseract runtime assets

These files are served from the SplitHutang origin so receipt scanning does not
depend on a third-party CDN at runtime.

- `worker.min.js` comes from `tesseract.js@7.0.0` (Apache-2.0).
- Files in `core/` come from `tesseract.js-core@7.0.0` (Apache-2.0).
- `lang/eng.traineddata.gz` comes from
  `@tesseract.js-data/eng@1.0.0/4.0.0_best_int` (package metadata: MIT).

The upstream Tesseract.js and Tesseract.js-core license texts are included in
this directory.
