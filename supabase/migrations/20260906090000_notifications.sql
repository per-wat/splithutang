-- SplitHutang notification centre, Realtime feed, preferences and Web Push outbox.
-- Domain notifications are generated inside the database because the existing
-- application performs its financial mutations through SECURITY DEFINER RPCs.

do $$
begin
  create type public.notification_push_mode as enum (
    'in_app_only',
    'all_important',
    'payments_only'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (notification_type in (
    'expense_created',
    'expense_updated',
    'expense_deleted',
    'expense_payment_submitted',
    'expense_payment_recorded',
    'expense_payment_confirmed',
    'expense_payment_rejected',
    'expense_settled',
    'iou_created',
    'iou_updated',
    'iou_deleted',
    'iou_payment_submitted',
    'iou_payment_recorded',
    'iou_payment_confirmed',
    'iou_payment_rejected',
    'iou_settled',
    'group_member_invited',
    'group_member_added',
    'group_member_joined',
    'group_member_left'
  )),
  title text not null,
  body text not null,
  group_id uuid,
  resource_type text not null check (resource_type in (
    'expense', 'iou', 'group', 'person', 'group_invite'
  )),
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  deduplication_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_recipient_dedup_key
  on public.notifications (recipient_user_id, deduplication_key)
  where deduplication_key is not null;

create index if not exists notifications_recipient_newest
  on public.notifications (recipient_user_id, created_at desc, id desc);

create index if not exists notifications_recipient_unread
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_mode public.notification_push_mode not null default 'in_app_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id
  on public.push_subscriptions (user_id, updated_at desc);

create table if not exists public.notification_push_outbox (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_push_outbox_pending
  on public.notification_push_outbox (next_attempt_at, created_at)
  where processed_at is null;

create or replace function public.claim_notification_push_outbox(p_limit integer default 50)
returns table (notification_id uuid)
language sql
security definer
set search_path = ''
as $$
  with available as (
    select outbox.notification_id
    from public.notification_push_outbox outbox
    where outbox.processed_at is null
      and outbox.next_attempt_at <= now()
      and (outbox.locked_at is null or outbox.locked_at < now() - interval '5 minutes')
    order by outbox.next_attempt_at, outbox.created_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.notification_push_outbox outbox
  set locked_at = now()
  from available
  where outbox.notification_id = available.notification_id
  returning outbox.notification_id;
$$;

revoke all on function public.claim_notification_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_push_outbox(integer) to service_role;

-- One row per changed resource and transaction. A deferred trigger turns the
-- final transaction state into exactly one notification per recipient.
create table if not exists private.notification_mutations (
  id bigint generated always as identity primary key,
  transaction_id bigint not null,
  resource_type text not null check (resource_type in ('expense', 'iou')),
  resource_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  actor_user_id uuid,
  prior_recipient_user_ids uuid[] not null default '{}'::uuid[],
  snapshot jsonb not null default '{}'::jsonb,
  unique (transaction_id, resource_type, resource_id)
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_push_outbox enable row level security;

revoke all on public.notifications from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.notification_push_outbox from anon, authenticated;
revoke all on private.notification_mutations from public, anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
-- Push subscriptions are written only by the authenticated server route. This
-- keeps an ordinary browser client from storing arbitrary delivery endpoints.
grant select on public.notifications, public.notification_preferences to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, update, delete on public.notification_push_outbox to service_role;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
  on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Keep the public mutable tables' timestamps consistent with the rest of the app.
drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

create or replace function private.notification_actor_snapshot(p_actor_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'actor_name', coalesce(p.display_name, 'Someone'),
    'actor_avatar_color', coalesce(p.avatar_color, 'bg-blue-600'),
    'actor_avatar_path', p.avatar_path
  )
  from (select 1) seed
  left join public.profiles p on p.id = p_actor_user_id;
$$;

create or replace function private.create_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_group_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_metadata jsonb,
  p_deduplication_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
begin
  if p_recipient_user_id is null
     or p_recipient_user_id is not distinct from p_actor_user_id then
    return;
  end if;

  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    notification_type,
    title,
    body,
    group_id,
    resource_type,
    resource_id,
    metadata,
    deduplication_key
  ) values (
    p_recipient_user_id,
    p_actor_user_id,
    p_notification_type,
    p_title,
    p_body,
    p_group_id,
    p_resource_type,
    p_resource_id,
    coalesce(p_metadata, '{}'::jsonb)
      || private.notification_actor_snapshot(p_actor_user_id),
    p_deduplication_key
  )
  on conflict (recipient_user_id, deduplication_key)
    where deduplication_key is not null
  do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    insert into public.notification_push_outbox (notification_id)
    values (v_notification_id)
    on conflict (notification_id) do nothing;
  end if;
end;
$$;

create or replace function private.person_user_id(p_person_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.linked_user_id
  from public.people p
  where p.id = p_person_id;
$$;

create or replace function private.is_identity_merge(
  p_old_person_id uuid,
  p_new_person_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people old_person
    join public.people new_person on new_person.id = p_new_person_id
    where old_person.id = p_old_person_id
      and old_person.linked_user_id is null
      and new_person.linked_user_id = (select auth.uid())
  );
$$;

create or replace function private.is_pending_identity_claim_source(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_invites gi
    join auth.users u
      on lower(trim(u.email)) = lower(trim(gi.email))
    where u.id = (select auth.uid())
      and gi.person_id = p_person_id
      and gi.status = 'pending'
      and gi.expires_at > now()
  );
$$;

create or replace function private.mark_notification_identity_merge_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- claim_group_invite() always moves or removes the source membership before
  -- rewriting financial rows. Mark only that transaction, not every session
  -- belonging to a user who happens to have a pending invitation.
  if (
    tg_op = 'UPDATE'
    and old.person_id is distinct from new.person_id
    and private.is_identity_merge(old.person_id, new.person_id)
  ) or (
    tg_op = 'DELETE'
    and private.is_pending_identity_claim_source(old.person_id)
  ) then
    perform set_config('app.notification_identity_merge', 'on', true);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function private.suppress_financial_notifications()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(current_setting('app.notification_identity_merge', true), '') = 'on';
$$;

create or replace function private.is_active_group_user(
  p_group_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.people p on p.id = gm.person_id
    where gm.group_id = p_group_id
      and gm.membership_status = 'active'
      and p.linked_user_id = p_user_id
  );
$$;

create or replace function private.expense_recipient_user_ids(p_expense_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct involved.user_id) filter (where involved.user_id is not null), '{}'::uuid[])
  from (
    select payer.linked_user_id as user_id
    from public.expenses e
    join public.people payer on payer.id = e.paid_by
    where e.id = p_expense_id

    union all

    select participant.linked_user_id
    from public.expense_participants ep
    join public.people participant on participant.id = ep.person_id
    where ep.expense_id = p_expense_id

    union all

    select assignee.linked_user_id
    from public.expense_items ei
    join public.expense_item_participants eip on eip.expense_item_id = ei.id
    join public.people assignee on assignee.id = eip.person_id
    where ei.expense_id = p_expense_id
  ) involved;
$$;

create or replace function private.iou_recipient_user_ids(p_iou_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.linked_user_id) filter (where p.linked_user_id is not null), '{}'::uuid[])
  from public.ious i
  join public.people p on p.id in (i.from_person_id, i.to_person_id)
  where i.id = p_iou_id;
$$;

create or replace function private.queue_notification_mutation(
  p_resource_type text,
  p_resource_id uuid,
  p_action text,
  p_prior_recipient_user_ids uuid[] default '{}'::uuid[],
  p_snapshot jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into private.notification_mutations (
    transaction_id,
    resource_type,
    resource_id,
    action,
    actor_user_id,
    prior_recipient_user_ids,
    snapshot
  ) values (
    txid_current(),
    p_resource_type,
    p_resource_id,
    p_action,
    auth.uid(),
    coalesce(p_prior_recipient_user_ids, '{}'::uuid[]),
    coalesce(p_snapshot, '{}'::jsonb)
  )
  on conflict (transaction_id, resource_type, resource_id)
  do update set
    action = case
      when private.notification_mutations.action = 'deleted'
           or excluded.action = 'deleted' then 'deleted'
      when private.notification_mutations.action = 'created' then 'created'
      else 'updated'
    end,
    prior_recipient_user_ids = (
      select coalesce(array_agg(distinct user_id), '{}'::uuid[])
      from unnest(
        private.notification_mutations.prior_recipient_user_ids
        || excluded.prior_recipient_user_ids
      ) as recipients(user_id)
      where recipients.user_id is not null
    ),
    snapshot = private.notification_mutations.snapshot || excluded.snapshot;
end;
$$;

revoke all on function private.notification_actor_snapshot(uuid) from public, anon, authenticated;
revoke all on function private.create_notification(uuid, uuid, text, text, text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.person_user_id(uuid) from public, anon, authenticated;
revoke all on function private.is_identity_merge(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_pending_identity_claim_source(uuid) from public, anon, authenticated;
revoke all on function private.mark_notification_identity_merge_context() from public, anon, authenticated;
revoke all on function private.suppress_financial_notifications() from public, anon, authenticated;
revoke all on function private.is_active_group_user(uuid, uuid) from public, anon, authenticated;
revoke all on function private.expense_recipient_user_ids(uuid) from public, anon, authenticated;
revoke all on function private.iou_recipient_user_ids(uuid) from public, anon, authenticated;
revoke all on function private.queue_notification_mutation(text, uuid, text, uuid[], jsonb) from public, anon, authenticated;

create or replace function private.process_notification_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mutation private.notification_mutations%rowtype;
  v_recipient_user_ids uuid[] := '{}'::uuid[];
  v_recipient_user_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_resource_name text;
  v_amount numeric;
  v_actor_name text;
  v_type text;
  v_title text;
  v_body text;
  v_metadata jsonb;
  v_resource_id uuid;
begin
  select * into v_mutation
  from private.notification_mutations
  where id = new.id
  for update;

  if not found then
    return null;
  end if;

  select coalesce(p.display_name, 'Someone') into v_actor_name
  from (select 1) seed
  left join public.profiles p on p.id = v_mutation.actor_user_id;

  if v_mutation.resource_type = 'expense' then
    select
      e.group_id,
      g.name,
      e.name,
      e.total_amount
    into
      v_group_id,
      v_group_name,
      v_resource_name,
      v_amount
    from public.expenses e
    left join public.groups g on g.id = e.group_id
    where e.id = v_mutation.resource_id;

    if found then
      v_recipient_user_ids := v_mutation.prior_recipient_user_ids
        || private.expense_recipient_user_ids(v_mutation.resource_id);
      v_metadata := v_mutation.snapshot || jsonb_build_object(
        'expense_name', v_resource_name,
        'group_name', coalesce(v_group_name, 'a group'),
        'amount', v_amount
      );
      v_resource_id := v_mutation.resource_id;
    else
      v_recipient_user_ids := v_mutation.prior_recipient_user_ids;
      v_group_id := nullif(v_mutation.snapshot ->> 'group_id', '')::uuid;
      v_group_name := coalesce(v_mutation.snapshot ->> 'group_name', 'a group');
      v_resource_name := coalesce(v_mutation.snapshot ->> 'expense_name', 'an expense');
      v_amount := nullif(v_mutation.snapshot ->> 'amount', '')::numeric;
      v_metadata := v_mutation.snapshot;
      v_resource_id := null;
    end if;

    if v_mutation.action = 'created' then
      v_type := 'expense_created';
      v_title := format('%s added an expense in %s.', v_actor_name, coalesce(v_group_name, 'a group'));
      v_body := format('%s · RM %s', v_resource_name, to_char(coalesce(v_amount, 0), 'FM999999990.00'));
    elsif v_mutation.action = 'deleted' then
      v_type := 'expense_deleted';
      v_title := format('%s deleted %s.', v_actor_name, v_resource_name);
      v_body := format('The expense was removed from %s.', coalesce(v_group_name, 'the group'));
      v_resource_id := null;
    else
      v_type := 'expense_updated';
      v_title := format('%s updated %s.', v_actor_name, v_resource_name);
      v_body := format('Expense details changed in %s.', coalesce(v_group_name, 'the group'));
    end if;
  else
    select
      i.group_id,
      g.name,
      i.reason,
      i.amount
    into
      v_group_id,
      v_group_name,
      v_resource_name,
      v_amount
    from public.ious i
    left join public.groups g on g.id = i.group_id
    where i.id = v_mutation.resource_id;

    if found then
      v_recipient_user_ids := v_mutation.prior_recipient_user_ids
        || private.iou_recipient_user_ids(v_mutation.resource_id);
      v_metadata := v_mutation.snapshot || jsonb_build_object(
        'iou_reason', v_resource_name,
        'group_name', coalesce(v_group_name, 'a group'),
        'amount', v_amount
      );
      v_resource_id := v_mutation.resource_id;
    else
      v_recipient_user_ids := v_mutation.prior_recipient_user_ids;
      v_group_id := nullif(v_mutation.snapshot ->> 'group_id', '')::uuid;
      v_group_name := coalesce(v_mutation.snapshot ->> 'group_name', 'a group');
      v_resource_name := coalesce(v_mutation.snapshot ->> 'iou_reason', 'an IOU');
      v_amount := nullif(v_mutation.snapshot ->> 'amount', '')::numeric;
      v_metadata := v_mutation.snapshot;
      v_resource_id := null;
    end if;

    if v_mutation.action = 'created' then
      v_type := 'iou_created';
      v_title := format('%s added an IOU in %s.', v_actor_name, coalesce(v_group_name, 'a group'));
      v_body := format('%s · RM %s', v_resource_name, to_char(coalesce(v_amount, 0), 'FM999999990.00'));
    elsif v_mutation.action = 'deleted' then
      v_type := 'iou_deleted';
      v_title := format('%s deleted %s.', v_actor_name, v_resource_name);
      v_body := format('The IOU was removed from %s.', coalesce(v_group_name, 'the group'));
      v_resource_id := null;
    else
      v_type := 'iou_updated';
      v_title := format('%s updated %s.', v_actor_name, v_resource_name);
      v_body := format('IOU details changed in %s.', coalesce(v_group_name, 'the group'));
    end if;
  end if;

  for v_recipient_user_id in
    select distinct recipient_id
    from unnest(v_recipient_user_ids) as recipients(recipient_id)
    where recipients.recipient_id is not null
      and recipients.recipient_id is distinct from v_mutation.actor_user_id
      and private.is_active_group_user(v_group_id, recipients.recipient_id)
  loop
    perform private.create_notification(
      v_recipient_user_id,
      v_mutation.actor_user_id,
      v_type,
      v_title,
      v_body,
      v_group_id,
      v_mutation.resource_type,
      v_resource_id,
      v_metadata,
      format(
        '%s:%s:%s:%s:%s',
        v_mutation.resource_type,
        v_mutation.action,
        v_mutation.resource_id,
        v_mutation.transaction_id,
        v_recipient_user_id
      )
    );
  end loop;

  delete from private.notification_mutations where id = new.id;
  return null;
end;
$$;

revoke all on function private.process_notification_mutation() from public, anon, authenticated;

drop trigger if exists process_notification_mutation_deferred on private.notification_mutations;
create constraint trigger process_notification_mutation_deferred
after insert on private.notification_mutations
deferrable initially deferred
for each row execute function private.process_notification_mutation();

create or replace function private.queue_expense_row_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prior uuid[] := '{}'::uuid[];
begin
  if tg_op = 'UPDATE' then
    if private.suppress_financial_notifications() then
      return new;
    end if;

    if old.group_id is not distinct from new.group_id
       and old.paid_by is not distinct from new.paid_by
       and old.split_method is not distinct from new.split_method
       and old.total_amount is not distinct from new.total_amount
       and old.expense_date is not distinct from new.expense_date then
      return new;
    end if;

    if old.paid_by is distinct from new.paid_by
       and private.is_identity_merge(old.paid_by, new.paid_by) then
      return new;
    end if;

    v_prior := private.expense_recipient_user_ids(old.id)
      || array[private.person_user_id(old.paid_by)];
    perform private.queue_notification_mutation('expense', new.id, 'updated', v_prior, '{}'::jsonb);
    return new;
  end if;

  perform private.queue_notification_mutation('expense', new.id, 'created');
  return new;
end;
$$;

create or replace function private.queue_expense_delete_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_name text;
begin
  select g.name into v_group_name from public.groups g where g.id = old.group_id;
  perform private.queue_notification_mutation(
    'expense',
    old.id,
    'deleted',
    private.expense_recipient_user_ids(old.id),
    jsonb_build_object(
      'expense_name', old.name,
      'group_id', old.group_id,
      'group_name', coalesce(v_group_name, 'a group'),
      'amount', old.total_amount
    )
  );
  return old;
end;
$$;

create or replace function private.queue_expense_child_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense_id uuid;
  v_old_person_id uuid;
  v_new_person_id uuid;
  v_prior uuid[] := '{}'::uuid[];
begin
  if tg_op <> 'INSERT' and private.suppress_financial_notifications() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'expense_participants'
       and old.expense_id is not distinct from new.expense_id
       and old.person_id is not distinct from new.person_id
       and old.share_amount is not distinct from new.share_amount then
      return new;
    elsif tg_table_name = 'expense_items'
       and old.expense_id is not distinct from new.expense_id
       and old.amount is not distinct from new.amount then
      return new;
    elsif tg_table_name = 'expense_item_participants'
       and old.expense_item_id is not distinct from new.expense_item_id
       and old.person_id is not distinct from new.person_id then
      return new;
    elsif tg_table_name = 'expense_item_addons'
       and old.expense_item_id is not distinct from new.expense_item_id
       and old.amount is not distinct from new.amount then
      return new;
    end if;
  end if;

  if tg_table_name = 'expense_participants' then
    if tg_op = 'DELETE' then
      v_expense_id := old.expense_id;
      v_old_person_id := old.person_id;
    elsif tg_op = 'INSERT' then
      v_expense_id := new.expense_id;
      v_new_person_id := new.person_id;
    else
      v_expense_id := new.expense_id;
      v_old_person_id := old.person_id;
      v_new_person_id := new.person_id;
    end if;
  elsif tg_table_name = 'expense_item_participants' then
    if tg_op = 'DELETE' then
      select ei.expense_id into v_expense_id
      from public.expense_items ei where ei.id = old.expense_item_id;
      v_old_person_id := old.person_id;
    else
      select ei.expense_id into v_expense_id
      from public.expense_items ei where ei.id = new.expense_item_id;
      if tg_op = 'UPDATE' then v_old_person_id := old.person_id; end if;
      v_new_person_id := new.person_id;
    end if;
  elsif tg_table_name = 'expense_items' then
    if tg_op = 'DELETE' then
      v_expense_id := old.expense_id;
    else
      v_expense_id := new.expense_id;
    end if;
  else
    if tg_op = 'DELETE' then
      select ei.expense_id into v_expense_id
      from public.expense_items ei where ei.id = old.expense_item_id;
    else
      select ei.expense_id into v_expense_id
      from public.expense_items ei where ei.id = new.expense_item_id;
    end if;
  end if;

  if v_expense_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if v_old_person_id is not null and v_new_person_id is not null
     and private.is_identity_merge(v_old_person_id, v_new_person_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_prior := private.expense_recipient_user_ids(v_expense_id);
  if v_old_person_id is not null then
    v_prior := v_prior || array[private.person_user_id(v_old_person_id)];
  end if;

  perform private.queue_notification_mutation('expense', v_expense_id, 'updated', v_prior, '{}'::jsonb);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.queue_expense_row_notification() from public, anon, authenticated;
revoke all on function private.queue_expense_delete_notification() from public, anon, authenticated;
revoke all on function private.queue_expense_child_notification() from public, anon, authenticated;

drop trigger if exists queue_expense_row_notification on public.expenses;
create trigger queue_expense_row_notification
after insert or update on public.expenses
for each row execute function private.queue_expense_row_notification();

drop trigger if exists queue_expense_delete_notification on public.expenses;
create trigger queue_expense_delete_notification
before delete on public.expenses
for each row execute function private.queue_expense_delete_notification();

drop trigger if exists queue_expense_participant_notification on public.expense_participants;
create trigger queue_expense_participant_notification
after insert or update or delete on public.expense_participants
for each row execute function private.queue_expense_child_notification();

drop trigger if exists queue_expense_item_notification on public.expense_items;
create trigger queue_expense_item_notification
after insert or update or delete on public.expense_items
for each row execute function private.queue_expense_child_notification();

drop trigger if exists queue_expense_item_participant_notification on public.expense_item_participants;
create trigger queue_expense_item_participant_notification
after insert or update or delete on public.expense_item_participants
for each row execute function private.queue_expense_child_notification();

drop trigger if exists queue_expense_addon_notification on public.expense_item_addons;
create trigger queue_expense_addon_notification
after insert or update or delete on public.expense_item_addons
for each row execute function private.queue_expense_child_notification();

create or replace function private.queue_iou_row_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prior uuid[] := '{}'::uuid[];
begin
  if tg_op = 'UPDATE' then
    if private.suppress_financial_notifications() then
      return new;
    end if;

    if old.group_id is not distinct from new.group_id
       and old.from_person_id is not distinct from new.from_person_id
       and old.to_person_id is not distinct from new.to_person_id
       and old.amount is not distinct from new.amount
       and old.iou_date is not distinct from new.iou_date then
      return new;
    end if;

    if (
      old.from_person_id is distinct from new.from_person_id
      and private.is_identity_merge(old.from_person_id, new.from_person_id)
    ) or (
      old.to_person_id is distinct from new.to_person_id
      and private.is_identity_merge(old.to_person_id, new.to_person_id)
    ) then
      return new;
    end if;

    v_prior := private.iou_recipient_user_ids(old.id)
      || array[
        private.person_user_id(old.from_person_id),
        private.person_user_id(old.to_person_id)
      ];
    perform private.queue_notification_mutation('iou', new.id, 'updated', v_prior, '{}'::jsonb);
    return new;
  end if;

  perform private.queue_notification_mutation('iou', new.id, 'created');
  return new;
end;
$$;

create or replace function private.queue_iou_delete_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_name text;
begin
  select g.name into v_group_name from public.groups g where g.id = old.group_id;
  perform private.queue_notification_mutation(
    'iou',
    old.id,
    'deleted',
    private.iou_recipient_user_ids(old.id),
    jsonb_build_object(
      'iou_reason', old.reason,
      'group_id', old.group_id,
      'group_name', coalesce(v_group_name, 'a group'),
      'amount', old.amount
    )
  );
  return old;
end;
$$;

revoke all on function private.queue_iou_row_notification() from public, anon, authenticated;
revoke all on function private.queue_iou_delete_notification() from public, anon, authenticated;

drop trigger if exists queue_iou_row_notification on public.ious;
create trigger queue_iou_row_notification
after insert or update on public.ious
for each row execute function private.queue_iou_row_notification();

drop trigger if exists queue_iou_delete_notification on public.ious;
create trigger queue_iou_delete_notification
before delete on public.ious
for each row execute function private.queue_iou_delete_notification();

create or replace function private.notify_expense_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
  v_recipient_user_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_expense_name text;
  v_type text;
  v_title text;
  v_body text;
  v_is_settled boolean := false;
begin
  if v_actor_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and private.suppress_financial_notifications() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.amount is not distinct from new.amount
     and old.from_person_id is not distinct from new.from_person_id
     and old.to_person_id is not distinct from new.to_person_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    (old.from_person_id is distinct from new.from_person_id
     and private.is_identity_merge(old.from_person_id, new.from_person_id))
    or
    (old.to_person_id is distinct from new.to_person_id
     and private.is_identity_merge(old.to_person_id, new.to_person_id))
  ) then
    return new;
  end if;

  select
    e.group_id,
    g.name,
    e.name,
    coalesce(p.display_name, 'Someone')
  into v_group_id, v_group_name, v_expense_name, v_actor_name
  from public.expenses e
  join public.groups g on g.id = e.group_id
  left join public.profiles p on p.id = v_actor_user_id
  where e.id = new.expense_id;

  if new.status = 'confirmed' then
    select not exists (
      select 1
      from public.expense_participants ep
      where ep.expense_id = new.expense_id
        and ep.person_id <> (select e.paid_by from public.expenses e where e.id = new.expense_id)
        and ep.share_amount > coalesce((
          select sum(pay.amount)
          from public.expense_payments pay
          where pay.expense_id = ep.expense_id
            and pay.from_person_id = ep.person_id
            and pay.status = 'confirmed'
        ), 0)
    ) into v_is_settled;
  end if;

  if new.status = 'pending' then
    v_type := 'expense_payment_submitted';
    v_title := format('%s submitted a payment.', v_actor_name);
    v_body := format('RM %s for %s is awaiting confirmation.', to_char(new.amount, 'FM999999990.00'), v_expense_name);
  elsif new.status = 'rejected' then
    v_type := 'expense_payment_rejected';
    v_title := format('%s declined a payment.', v_actor_name);
    v_body := format('A payment for %s was declined.', v_expense_name);
  elsif v_is_settled then
    v_type := 'expense_settled';
    v_title := format('%s settled %s.', v_actor_name, v_expense_name);
    v_body := format('The expense in %s is fully settled.', v_group_name);
  elsif tg_op = 'UPDATE' then
    v_type := 'expense_payment_confirmed';
    v_title := format('%s confirmed a payment.', v_actor_name);
    v_body := format('RM %s was confirmed for %s.', to_char(new.amount, 'FM999999990.00'), v_expense_name);
  else
    v_type := 'expense_payment_recorded';
    v_title := format('%s recorded a payment.', v_actor_name);
    v_body := format('RM %s was paid toward %s.', to_char(new.amount, 'FM999999990.00'), v_expense_name);
  end if;

  for v_recipient_user_id in
    select distinct p.linked_user_id
    from unnest(array[new.from_person_id, new.to_person_id]) as involved(person_id)
    join public.people p on p.id = involved.person_id
    join public.group_members gm
      on gm.group_id = v_group_id
     and gm.person_id = p.id
     and gm.membership_status = 'active'
  loop
    perform private.create_notification(
      v_recipient_user_id,
      v_actor_user_id,
      v_type,
      v_title,
      v_body,
      v_group_id,
      'expense',
      new.expense_id,
      jsonb_build_object(
        'expense_name', v_expense_name,
        'group_name', v_group_name,
        'amount', new.amount,
        'payment_status', new.status
      ),
      format('expense-payment:%s:%s:%s', new.id, new.status, v_recipient_user_id)
    );
  end loop;

  return new;
end;
$$;

create or replace function private.notify_iou_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
  v_recipient_user_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_iou_reason text;
  v_iou_amount numeric;
  v_type text;
  v_title text;
  v_body text;
  v_is_settled boolean := false;
begin
  if v_actor_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and private.suppress_financial_notifications() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.amount is not distinct from new.amount
     and old.from_person_id is not distinct from new.from_person_id
     and old.to_person_id is not distinct from new.to_person_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    (old.from_person_id is distinct from new.from_person_id
     and private.is_identity_merge(old.from_person_id, new.from_person_id))
    or
    (old.to_person_id is distinct from new.to_person_id
     and private.is_identity_merge(old.to_person_id, new.to_person_id))
  ) then
    return new;
  end if;

  select
    i.group_id,
    g.name,
    i.reason,
    i.amount,
    coalesce(p.display_name, 'Someone')
  into v_group_id, v_group_name, v_iou_reason, v_iou_amount, v_actor_name
  from public.ious i
  join public.groups g on g.id = i.group_id
  left join public.profiles p on p.id = v_actor_user_id
  where i.id = new.iou_id;

  if new.status = 'confirmed' then
    select coalesce(sum(pay.amount), 0) >= v_iou_amount
    into v_is_settled
    from public.iou_payments pay
    where pay.iou_id = new.iou_id
      and pay.status = 'confirmed';
  end if;

  if new.status = 'pending' then
    v_type := 'iou_payment_submitted';
    v_title := format('%s submitted an IOU payment.', v_actor_name);
    v_body := format('RM %s for %s is awaiting confirmation.', to_char(new.amount, 'FM999999990.00'), v_iou_reason);
  elsif new.status = 'rejected' then
    v_type := 'iou_payment_rejected';
    v_title := format('%s declined an IOU payment.', v_actor_name);
    v_body := format('A payment for %s was declined.', v_iou_reason);
  elsif v_is_settled then
    v_type := 'iou_settled';
    v_title := format('%s marked your IOU as paid.', v_actor_name);
    v_body := format('%s is now settled.', v_iou_reason);
  elsif tg_op = 'UPDATE' then
    v_type := 'iou_payment_confirmed';
    v_title := format('%s confirmed an IOU payment.', v_actor_name);
    v_body := format('RM %s was confirmed for %s.', to_char(new.amount, 'FM999999990.00'), v_iou_reason);
  else
    v_type := 'iou_payment_recorded';
    v_title := format('%s recorded an IOU payment.', v_actor_name);
    v_body := format('RM %s was paid toward %s.', to_char(new.amount, 'FM999999990.00'), v_iou_reason);
  end if;

  for v_recipient_user_id in
    select distinct p.linked_user_id
    from unnest(array[new.from_person_id, new.to_person_id]) as involved(person_id)
    join public.people p on p.id = involved.person_id
    join public.group_members gm
      on gm.group_id = v_group_id
     and gm.person_id = p.id
     and gm.membership_status = 'active'
  loop
    perform private.create_notification(
      v_recipient_user_id,
      v_actor_user_id,
      v_type,
      v_title,
      v_body,
      v_group_id,
      'iou',
      new.iou_id,
      jsonb_build_object(
        'iou_reason', v_iou_reason,
        'group_name', v_group_name,
        'amount', new.amount,
        'payment_status', new.status
      ),
      format('iou-payment:%s:%s:%s', new.id, new.status, v_recipient_user_id)
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.notify_expense_payment() from public, anon, authenticated;
revoke all on function private.notify_iou_payment() from public, anon, authenticated;

drop trigger if exists notify_expense_payment on public.expense_payments;
create trigger notify_expense_payment
after insert or update on public.expense_payments
for each row execute function private.notify_expense_payment();

drop trigger if exists notify_iou_payment on public.iou_payments;
create trigger notify_iou_payment
after insert or update on public.iou_payments
for each row execute function private.notify_iou_payment();

create or replace function private.notify_group_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
  v_member_user_id uuid;
  v_member_name text;
  v_group_name text;
  v_recipient_user_id uuid;
  v_is_join boolean := false;
  v_is_added boolean := false;
begin
  if v_actor_user_id is null then
    return new;
  end if;

  select g.name into v_group_name
  from public.groups g where g.id = new.group_id;

  select p.linked_user_id, p.name
  into v_member_user_id, v_member_name
  from public.people p where p.id = new.person_id;

  select coalesce(p.display_name, 'Someone') into v_actor_name
  from (select 1) seed
  left join public.profiles p on p.id = v_actor_user_id;

  if tg_op = 'INSERT' and new.membership_status = 'active' then
    v_is_added := true;
  elsif old.person_id is distinct from new.person_id
        and new.membership_status = 'active'
        and private.is_identity_merge(old.person_id, new.person_id) then
    v_is_join := true;
  elsif old.membership_status <> 'active'
        and new.membership_status = 'active' then
    v_is_added := true;
  elsif old.membership_status = 'active'
        and new.membership_status in ('left', 'removed') then
    for v_recipient_user_id in
      select distinct p.linked_user_id
      from public.group_members gm
      join public.people p on p.id = gm.person_id
      where gm.group_id = new.group_id
        and gm.membership_status = 'active'
        and p.linked_user_id is not null
        and p.linked_user_id is distinct from v_actor_user_id
    loop
      perform private.create_notification(
        v_recipient_user_id,
        v_actor_user_id,
        'group_member_left',
        case
          when new.membership_status = 'left'
            then format('%s left %s.', coalesce(v_member_name, 'Someone'), coalesce(v_group_name, 'the group'))
          else format('%s is no longer in %s.', coalesce(v_member_name, 'Someone'), coalesce(v_group_name, 'the group'))
        end,
        'They will keep access to their authorised financial history.',
        new.group_id,
        'group',
        new.group_id,
        jsonb_build_object('group_name', v_group_name, 'member_name', v_member_name),
        format('group-ended:%s:%s:%s:%s:%s', new.group_id, new.person_id, new.membership_status, txid_current(), v_recipient_user_id)
      );
    end loop;
    return new;
  end if;

  if v_is_added and v_member_user_id is not null then
    perform private.create_notification(
      v_member_user_id,
      v_actor_user_id,
      'group_member_added',
      format('%s added you to %s.', v_actor_name, coalesce(v_group_name, 'a group')),
      'You can now take part in this group.',
      new.group_id,
      'group',
      new.group_id,
      jsonb_build_object('group_name', v_group_name, 'member_name', v_member_name),
      format('group-added:%s:%s:%s', new.group_id, txid_current(), v_member_user_id)
    );
  end if;

  if v_is_join then
    for v_recipient_user_id in
      select distinct p.linked_user_id
      from public.group_members gm
      join public.people p on p.id = gm.person_id
      where gm.group_id = new.group_id
        and gm.membership_status = 'active'
        and p.linked_user_id is not null
        and p.linked_user_id is distinct from v_actor_user_id
    loop
      perform private.create_notification(
        v_recipient_user_id,
        v_actor_user_id,
        'group_member_joined',
        format('%s joined %s.', coalesce(v_member_name, v_actor_name), coalesce(v_group_name, 'the group')),
        'The group now includes this SplitHutang account.',
        new.group_id,
        'group',
        new.group_id,
        jsonb_build_object('group_name', v_group_name, 'member_name', v_member_name),
        format('group-joined:%s:%s:%s', new.group_id, txid_current(), v_recipient_user_id)
      );
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_group_membership() from public, anon, authenticated;

create or replace function private.notify_group_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
  v_recipient_user_id uuid;
  v_group_name text;
  v_member_name text;
begin
  if v_actor_user_id is null then
    return new;
  end if;

  select u.id into v_recipient_user_id
  from auth.users u
  where lower(trim(u.email)) = lower(trim(new.email))
  order by u.created_at
  limit 1;

  if v_recipient_user_id is null
     or v_recipient_user_id is not distinct from v_actor_user_id then
    return new;
  end if;

  select coalesce(p.display_name, 'Someone') into v_actor_name
  from (select 1) seed
  left join public.profiles p on p.id = v_actor_user_id;

  select g.name, p.name into v_group_name, v_member_name
  from public.groups g
  left join public.people p on p.id = new.person_id
  where g.id = new.group_id;

  perform private.create_notification(
    v_recipient_user_id,
    v_actor_user_id,
    'group_member_invited',
    format('%s invited you to %s.', v_actor_name, coalesce(v_group_name, 'a group')),
    format('The invitation is for %s.', coalesce(v_member_name, 'a group member')),
    new.group_id,
    'group_invite',
    new.token,
    jsonb_build_object('group_name', v_group_name, 'member_name', v_member_name),
    format('group-invite:%s:%s', new.id, v_recipient_user_id)
  );

  return new;
end;
$$;

revoke all on function private.notify_group_invite() from public, anon, authenticated;

drop trigger if exists notify_group_invite on public.group_invites;
create trigger notify_group_invite
after insert on public.group_invites
for each row execute function private.notify_group_invite();

drop trigger if exists mark_notification_identity_merge_context on public.group_members;
create trigger mark_notification_identity_merge_context
before update of person_id or delete on public.group_members
for each row execute function private.mark_notification_identity_merge_context();

drop trigger if exists notify_group_membership on public.group_members;
create trigger notify_group_membership
after insert or update on public.group_members
for each row execute function private.notify_group_membership();

-- Realtime requires the row's previous read state for multi-device badge sync.
alter table public.notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication does not exist; enable notifications in the Supabase Realtime settings';
end
$$;
