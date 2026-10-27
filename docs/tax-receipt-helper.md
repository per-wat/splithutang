# Tax receipt helper — first version

Tax receipts is a restricted feature under the existing `tax_receipts` permission.
The creator has access initially. No other user receives a grant from this
migration. The creator can later grant access through Feature Access.

## User flow

1. Open **Support & setup → Tax receipts**.
2. Select an assessment year or open **What can I claim?** for plain-language
   Lifestyle and Sports guidance, examples, shared limits, and official sources.
3. Choose **Save receipt**, attach a JPG/PNG/WebP/PDF (up to 3 MB), enter the shop,
   payment date and full bill total. The payment date determines the assessment
   year; uploading a historic receipt does not use current-year rules.
4. Describe each potentially relevant portion. Suggestions are keyword hints,
   never eligibility decisions. Choose the type, beneficiary and amount, then
   answer the relevant condition. A receipt may contain up to 20 portions across
   categories; their sum cannot exceed the receipt total.
5. Save with incomplete answers if needed. **Needs checking** explains the
   missing information and excludes that portion from estimates. Unsupported
   purchases/years are not automatically classified as ineligible. A mixed
   receipt can contribute its checked portion while other portions need review.
6. Review receipts, edit/recheck answers, search/filter, download an original,
   or permanently delete it. A failed deletion stays as **Deletion pending**
   with a retry action and is excluded from downloads/calculations.
7. Download a yearly ZIP: original files grouped by category, `summary.csv`,
   `receipt-index.csv`, `item-details.csv`, and `README.txt`. The default includes
   uncertain/non-eligible receipts too. The optional claim-related export keeps
   originals with a potentially claimable portion. The summary still covers all
   active receipts in the year, as explained in the pack.

## Amounts and rule scope

All calculations use integer sen. The **full receipt total**, **amounts submitted
for checking**, **eligible amount before limits**, and **estimated relief after
annual limits** are distinct. The yearly category cap is shared across receipts,
not applied afresh to each purchase. Cap allocation is deterministic by payment
date then receipt ID. Estimates are not tax refunds, filed claims, or approval.
Other claims recorded outside this app and joint-assessment circumstances must
be reviewed before filing. There is no automatic submission to LHDN.

Supported rule versions (checked 27 October 2026):

| Assessment year | Version | Lifestyle cap | Sports cap | Official reference |
| --- | --- | --- | --- | --- |
| 2025 | `2025.1` | RM2,500 | RM1,000 | [BE 2025 explanatory notes, G9–G10](https://www.hasil.gov.my/wp-content/uploads/notapenerangan_be2025_1.pdf) |
| 2026 | `2026.1` | RM2,500 | RM1,000 | [TP1 2026 explanatory notes, C5–C6](https://www.hasil.gov.my/wp-content/uploads/nota-penerangan-tp1-2026.pdf) |

Rules check residency, personally borne costs, beneficiary, duplicate-claim
confirmation, and the purchase-specific condition. Examples include personal
use for devices, the subscriber's name for internet, and organiser/provider
requirements for sport. Parent-benefit sport requires checking Malaysian tax
residency. The detailed YA2025 competition-beneficiary wording is treated
conservatively as needing review for a parent rather than automatically approved.

Receipt metadata stores the rule version used at its last save/review; changing
the payment date deliberately rechecks it against the selected year's version.
Unsupported years use `unreviewed`. Do not silently overwrite published versions
or apply a later year's rules to older receipts. When introducing a new version,
explicitly review default-version selection and annual-cap aggregation; current
versions have one rule set per supported assessment year.

Medical, childcare, insurance and other categories can be saved but are not
calculated yet. This version uses manual receipt entry and free deterministic
checks; it adds no paid service or AI/OCR dependency. Supporting papers can be
combined into the single receipt PDF; separate multi-attachment management is
outside this version.

LHDN's [individual FAQ](https://www.hasil.gov.my/individu/soalan-lazim-individu/)
describes retaining supporting records for seven years from the end of the year
the return was submitted. No automatic expiry or deletion is implemented. Keep
original evidence as required; storing a scan here is not a blanket legal claim
that every paper original can be discarded.

## Privacy and storage

`tax_receipts` has RLS enabled and no browser-role table grants/policies. The
private `tax-receipts` bucket has a restrictive policy denying direct anonymous
and authenticated storage operations, even if a broad permissive policy is later
added for another bucket. Existing buckets remain unaffected.

The server-only data layer constructs its service client only after checking a
verified session and live feature access. It closes over that session's UID and
scopes every receipt query, edit, deletion, file lookup and export to it. No
caller-supplied owner ID is accepted. **Creator status is not a receipt-ownership
exception.** There is no in-app administrator view of other users' records.
Infrastructure administrators with direct database/storage access remain privileged.

Downloads proxy bytes through authenticated, uncached routes; no public URLs or
long-lived signed URLs are issued. Every download checks the recorded SHA-256
against the fetched original. New requests are denied when feature access is
revoked, while the stored records remain. Supported file types have MIME/signature
and 3 MB size checks. Identical files for the same user are rejected as duplicates;
re-photographed receipts still require the user's duplicate-claim review.

ZIP output is streamed with backpressure, loading one original at a time. CSV
cells are escaped and spreadsheet formula prefixes neutralised. Filenames are
constructed from dates/UUIDs, not untrusted paths. A failed original download
aborts the stream, so a partial archive must be discarded. Very large annual
packs remain subject to hosting execution limits and device memory for download.

Upload and database writes cannot be one transaction. Failed inserts are checked
for an ambiguous success before cleanup; private orphan files may require operator
reconciliation if both the metadata check and cleanup fail. Receipt content,
amounts and credentials are not included in application error logs.

## Deployment

Apply `supabase/migrations/20261027045611_tax_receipt_helper.sql` through the
existing migration workflow before using the feature. It creates the table,
validation function, private bucket and restrictive storage policy. No production
schema changes are applied while preparing this PR.

No new environment variables. Reuse the existing server-only
`SUPABASE_SECRET_KEY` and `USAGE_OWNER_USER_ID`, plus the public Supabase URL/key.
Use `npm ci` to install the pinned `fflate@0.8.2` ZIP dependency.

## Validation / acceptance checks

- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- `supabase/tests/tax_receipts_privacy.sql` in a migrated disposable database:
  constraints, generated year, RLS/ACLs, private bucket, and direct-storage denial
  even with a deliberately broad permissive test policy. Test changes roll back.
- As creator: upload a mixed bill; confirm full/eligible/capped amounts differ;
  leave answers unsure, then edit to resolve; cross the Lifestyle/Sports caps;
  change payment year; store an unsupported category/year; download both ZIP
  modes; inspect the CSV/index/originals; retry failed operations; delete a file.
- As a granted second account: repeat with its own receipts, then try another
  account's receipt IDs for read, edit, file download and delete. All must fail.
- As a non-granted/signed-out user: page and every receipt API must deny access.
  Revoke a grant and repeat requests to verify saved data remains inaccessible.

Pre-PR browser validation used the actual Next.js pages/API routes with an
isolated, fixture-only Supabase boundary (no production credentials or user
records). It covered mobile upload of a mixed receipt, explanations, edit/save,
year selection and unverified-year messaging, a ZIP with matching originals and
CSV amounts, denied user/page/API access, and horizontal overflow checks. Mobile
and desktop screenshots were visually inspected. Hosted Supabase integration
should still be checked after deploying the migration to a test environment.
