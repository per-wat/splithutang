# SplitHutang

SplitHutang is a mobile-first expense-sharing app built with Next.js 16 and Supabase.

## Local development

```bash
npm install
copy .env.example .env.local
npx supabase start
npx supabase migration up
npm run dev
```

Fill in the Supabase values printed by `npx supabase status`. Never expose `SUPABASE_SECRET_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `NOTIFICATION_WEBHOOK_SECRET`, or `CRON_SECRET` to browser code.

Run verification with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

With the local Supabase stack running, validate the migration and RLS isolation script with:

```bash
npx supabase db reset --no-seed
npx supabase test db supabase/tests/notifications_rls.sql
```

`db reset` is destructive to the local Supabase database only. Use it only when local data can be discarded; never run it against the linked production project.

## Notification setup

The migration at `supabase/migrations/20260906090000_notifications.sql` creates the notification history, preferences, multi-device Push API subscriptions, delivery outbox, RLS policies, Realtime publication entry, and database-authoritative domain triggers. Apply it locally with `npx supabase migration up`. Apply pending migrations to a deliberately linked remote project only when you intend to do so:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

The migration is additive and does not backfill notifications for old activity.

### Generate VAPID keys

Generate one key pair and retain it across deployments:

```bash
npx web-push generate-vapid-keys
```

Set these locally in `.env.local` and in the Vercel project environment:

- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`: public key; this is the only VAPID value exposed to the browser.
- `WEB_PUSH_VAPID_PRIVATE_KEY`: server-only private key.
- `WEB_PUSH_VAPID_SUBJECT`: a monitored `mailto:` address or HTTPS contact URL.
- `SUPABASE_SECRET_KEY`: server-only key used by the push outbox dispatcher.
- `NOTIFICATION_WEBHOOK_SECRET`: a long random shared secret for immediate dispatch.
- `CRON_SECRET`: a separate long random value used by Vercel Cron for retries.

Redeploy after changing `NEXT_PUBLIC_` values because Next.js embeds them at build time.

### Supabase Realtime

The migration idempotently adds `public.notifications` to the `supabase_realtime` publication and sets replica identity to full. If the project does not yet have that publication, enable Realtime for `notifications` in **Supabase Dashboard → Database → Publications → supabase_realtime** after applying the migration.

### Immediate Web Push webhook

In **Supabase Dashboard → Database → Webhooks**, create one webhook:

1. Name: `dispatch-notification-push`.
2. Table: `public.notification_push_outbox`.
3. Events: `INSERT` only.
4. Method and URL: `POST https://YOUR_APP_DOMAIN/api/notifications/push`.
5. HTTP header: `x-notification-secret: <the exact NOTIFICATION_WEBHOOK_SECRET value>`.

The endpoint claims a bounded outbox batch atomically. A Vercel Cron declared in `vercel.json` retries transient failures every five minutes; Vercel sends `Authorization: Bearer <CRON_SECRET>`. Permanent `404`/`410` push responses remove the expired browser subscription. Optional push delivery never participates in the expense/IOU/group transaction.

### Browser and mobile testing

Push works on HTTPS production origins and on `localhost` during local development. Open **Profile & Settings → Notifications**, choose a push mode, then press **Enable push on this browser**. Permission is requested only by that action. To disable external delivery while retaining in-app history, choose **In-app only**; use **Disable on this browser** first if you also want to remove that device subscription.

On iOS/iPadOS 16.4 or newer, install SplitHutang using Safari’s **Add to Home Screen**, launch the installed app, and enable push there. The settings screen explains this requirement when it detects a non-installed iOS browser. Denied and unsupported permission states do not trigger repeated prompts.

## Notification architecture

- Database triggers are authoritative because existing financial and group changes already go through restricted Supabase RPCs. Browser clients have no notification insert permission.
- Expense and IOU changes are coalesced per resource and database transaction, then emitted at commit from the final participant state. This deduplicates payers, participants, item assignees and repeated sub-item rows while preserving recipients removed by the change.
- Payment and settlement rows generate dedicated event types. Group membership triggers consider only active members for join/leave delivery.
- Notification snapshots keep actor, group and resource wording useful after later edits or deletes; resource columns intentionally do not cascade from financial tables.
- The client subscribes only to `recipient_user_id = auth.uid()`. RLS restricts history and read state to that recipient. Preferences and subscriptions are also owner-only.
- Web Push uses a durable outbox, an authenticated Vercel route and a scheduled retry. `payments_only` filters external delivery, never the in-app activity record.
