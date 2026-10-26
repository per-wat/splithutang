# Restricted feature access

The creator opens **Support & setup → Feature Access**, searches registered users
by display name or email, then ticks a feature to grant access or unticks it to
revoke access. Changes save immediately. The creator's checkboxes stay checked
and disabled. Search returns 20 users per page and supports literal partial
matches, including email addresses.

This change reserves `tax_receipts`. It does **not** implement receipt storage,
change existing public features, or show a nonfunctional tax receipt menu item.

## Deployment

Apply `supabase/migrations/20261026103659_user_feature_access.sql` before using
the page. The existing GitHub workflow deploys new migrations after merge to main
when its database secrets are configured; otherwise use `npx supabase db push`
for each intended database. This PR does not apply a production migration.

Reuse the existing server-only variables; no new variables are required:

- `USAGE_OWNER_USER_ID`: the creator's Supabase Auth UUID (also used by Usage and Announcements).
- `SUPABASE_SECRET_KEY`: the existing Supabase server secret/service-role key.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Never prefix the owner ID or secret key with `NEXT_PUBLIC_`. An unset owner ID
locks administration. Feature permissions are independent of group membership.

## Enforcing a future feature

Register a key in `src/lib/features/catalog.ts` and extend the database's
`user_feature_access.feature_key` check constraint in a new migration. The
creator automatically receives all registered keys; everyone else defaults off.

At the start of every restricted server page:

```tsx
import { requireFeatureAccess } from "@/lib/features/server";

const user = await requireFeatureAccess("tax_receipts");
```

Every restricted API/action must independently call `getFeatureAccess()` and
reject unauthenticated callers (401) and callers missing its key (403) **before**
reading or writing feature data. `GET /api/features/access` exposes only the
current session's enabled keys for menu visibility; it does not accept a user ID.
Responses are private and uncached. Never trust a client-provided permission.

Grant reads are live, so revocation applies on the next request without a token
refresh or sign-out. A previously open page/menu may remain visible until its
next refresh; every feature's backend must still check each operation.
Database failures fail closed. The creator override is evaluated only on the
server from `USAGE_OWNER_USER_ID` and cannot be removed through this UI/API.

## Data isolation

`user_feature_access` has RLS with own-user SELECT only. Normal authenticated
users and anonymous clients cannot create, update, or delete grants. Only an
owner-authorized server route uses the service client to manage grants. User
search's privileged implementation lives in `private`, behind service-only
execute permissions and a service-only invoker RPC. Emails are never returned
to non-owners.

A feature grant authorizes **use**, not ownership of anyone else's data. When
receipt tables/storage are added, enforce both feature access and ownership on
all operations, with RLS/storage policies and protected downloads. The owner
exception currently lives in server code; a database policy must not assume it
can read an application environment variable. Design that enforcement when the
receipt data model is added. Never use editable user metadata as authorization.

Revoking a grant updates only its `enabled` flag. It does not delete feature
data. The row records the latest change time and the creator who changed it;
this is not a complete audit history.

## Validation

- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Run `supabase/tests/feature_access_rls.sql` against a migrated disposable/test
  Supabase database. It checks default denial, own-user reads, denied self-grants,
  denied user/email lookup, service-only management, and immediate revocation.
  All fixtures and changes roll back.
- As creator: search by name/email, grant, reload, revoke, verify creator stays
  enabled, and try a nonexistent user and an interrupted/offline request.
- As ordinary user: Feature Access is hidden, `/feature-access` and its admin API
  reject access, and `/api/features/access` contains only that user's keys.
