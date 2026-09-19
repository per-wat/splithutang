-- Owner-authored announcements reuse the existing server-only
-- USAGE_OWNER_USER_ID check in the application. Ordinary authenticated users
-- may read published announcements, but only the service role can publish or
-- manage them.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  body text not null,
  category text not null default 'information',
  action_label text,
  action_path text,
  send_push boolean not null default false,
  recipient_count integer not null default 0,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_length
    check (length(trim(title)) between 1 and 100),
  constraint announcements_body_length
    check (length(trim(body)) between 1 and 2000),
  constraint announcements_category_valid
    check (category in ('new_feature', 'information', 'maintenance', 'urgent')),
  constraint announcements_action_label_length
    check (action_label is null or length(trim(action_label)) between 1 and 40),
  constraint announcements_action_path_internal
    check (
      action_path is null
      or (
        length(action_path) between 1 and 500
        and left(action_path, 1) = '/'
        and left(action_path, 2) <> '//'
      )
    ),
  constraint announcements_action_pair
    check ((action_label is null) = (action_path is null)),
  constraint announcements_recipient_count_nonnegative
    check (recipient_count >= 0),
  constraint announcements_expiry_after_publish
    check (expires_at is null or expires_at > published_at)
);

create index announcements_published_newest
  on public.announcements (published_at desc, id desc);

create index announcements_created_by
  on public.announcements (created_by);

create index announcements_active
  on public.announcements (published_at desc)
  where archived_at is null;

alter table public.announcements enable row level security;

revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
grant select, insert, update, delete on public.announcements to service_role;

create policy announcements_select_published
  on public.announcements
  for select
  to authenticated
  using (published_at <= now());

drop trigger if exists set_announcements_updated_at on public.announcements;
create trigger set_announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

-- Extend the existing notification contract with announcements.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
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
    'group_member_left',
    'recurring_created',
    'recurring_updated',
    'recurring_payment_submitted',
    'recurring_payment_recorded',
    'recurring_payment_confirmed',
    'recurring_payment_rejected',
    'recurring_payment_due_soon',
    'recurring_payment_due',
    'announcement_published'
  ));

alter table public.notifications
  drop constraint if exists notifications_resource_type_check;

alter table public.notifications
  add constraint notifications_resource_type_check
  check (resource_type in (
    'expense',
    'iou',
    'group',
    'person',
    'group_invite',
    'recurring',
    'announcement'
  ));

grant insert on public.notifications to service_role;
grant insert on public.notification_push_outbox to service_role;

-- This function is SECURITY INVOKER and executable only by service_role. The
-- application route verifies the signed-in owner before the admin client calls
-- it, while the database function keeps announcement creation and fan-out in a
-- single transaction.
create or replace function public.publish_announcement(
  p_created_by uuid,
  p_title text,
  p_body text,
  p_category text,
  p_action_label text default null,
  p_action_path text default null,
  p_expires_at timestamptz default null,
  p_send_push boolean default false
)
returns table (announcement_id uuid, recipient_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_announcement_id uuid;
  v_recipient_count integer := 0;
begin
  insert into public.announcements (
    created_by,
    title,
    body,
    category,
    action_label,
    action_path,
    send_push,
    expires_at
  ) values (
    p_created_by,
    trim(p_title),
    trim(p_body),
    p_category,
    nullif(trim(p_action_label), ''),
    nullif(trim(p_action_path), ''),
    p_send_push,
    p_expires_at
  )
  returning id into v_announcement_id;

  with inserted_notifications as (
    insert into public.notifications (
      recipient_user_id,
      actor_user_id,
      notification_type,
      title,
      body,
      resource_type,
      resource_id,
      metadata,
      deduplication_key
    )
    select
      recipient.id,
      p_created_by,
      'announcement_published',
      trim(p_title),
      trim(p_body),
      'announcement',
      v_announcement_id,
      jsonb_strip_nulls(jsonb_build_object(
        'actor_name', creator.display_name,
        'actor_avatar_color', creator.avatar_color,
        'actor_avatar_path', creator.avatar_path,
        'announcement_category', p_category,
        'action_label', nullif(trim(p_action_label), ''),
        'action_path', nullif(trim(p_action_path), ''),
        'expires_at', p_expires_at
      )),
      format('announcement:%s:%s', v_announcement_id, recipient.id)
    from public.profiles recipient
    cross join public.profiles creator
    where creator.id = p_created_by
    returning id
  )
  select count(*)::integer
  into v_recipient_count
  from inserted_notifications;

  update public.announcements
  set recipient_count = v_recipient_count
  where id = v_announcement_id;

  if p_send_push then
    insert into public.notification_push_outbox (notification_id)
    select n.id
    from public.notifications n
    where n.notification_type = 'announcement_published'
      and n.resource_type = 'announcement'
      and n.resource_id = v_announcement_id
    on conflict (notification_id) do nothing;
  end if;

  return query select v_announcement_id, v_recipient_count;
end;
$$;

revoke all on function public.publish_announcement(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
) from public, anon, authenticated;

grant execute on function public.publish_announcement(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
) to service_role;
