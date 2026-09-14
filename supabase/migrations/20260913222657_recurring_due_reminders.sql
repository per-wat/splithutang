-- Create recurring-only reminders immediately before the existing daily push
-- delivery. Reminder rows are tied to one obligation and one reminder stage,
-- so retries are safe and advance payments suppress their future reminders.

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check check (notification_type in (
    'expense_created', 'expense_updated', 'expense_deleted',
    'expense_payment_submitted', 'expense_payment_recorded', 'expense_payment_confirmed',
    'expense_payment_rejected', 'expense_settled',
    'iou_created', 'iou_updated', 'iou_deleted',
    'iou_payment_submitted', 'iou_payment_recorded', 'iou_payment_confirmed',
    'iou_payment_rejected', 'iou_settled',
    'group_member_invited', 'group_member_added', 'group_member_joined', 'group_member_left',
    'recurring_created', 'recurring_updated', 'recurring_payment_submitted',
    'recurring_payment_recorded', 'recurring_payment_confirmed', 'recurring_payment_rejected',
    'recurring_payment_due_soon', 'recurring_payment_due'
  ));

create index if not exists recurring_periods_open_due
  on public.recurring_periods (due_date, arrangement_id)
  where state = 'open';

create or replace function public.create_recurring_due_notifications(
  p_today date default ((now() at time zone 'Asia/Kuala_Lumpur')::date)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_arrangement_id uuid;
  v_created integer := 0;
begin
  if p_today is null then
    raise exception 'Reminder date is required';
  end if;

  -- Periods are generated here so reminders do not depend on somebody opening
  -- a Recurring page first. Existing snapshots remain unchanged.
  for v_arrangement_id in
    select ra.id
    from public.recurring_arrangements ra
    where ra.status = 'active'
      and ra.start_date <= p_today + 7
      and (ra.end_date is null or ra.end_date >= p_today)
  loop
    perform private.generate_recurring_periods(
      v_arrangement_id,
      p_today,
      p_today + 7
    );
  end loop;

  with candidates as (
    select
      ro.id as obligation_id,
      person.linked_user_id as recipient_user_id,
      ra.id as arrangement_id,
      ra.group_id,
      g.name as group_name,
      ra.name as recurring_name,
      rp.period_start,
      rp.due_date,
      ro.share_amount,
      case
        when rp.due_date = p_today then 'due'
        else 'due_soon'
      end as reminder_kind
    from public.recurring_periods rp
    join public.recurring_arrangements ra on ra.id = rp.arrangement_id
    join public.recurring_obligations ro on ro.period_id = rp.id
    join public.people person on person.id = ro.person_id
    join public.group_members gm
      on gm.group_id = ra.group_id
      and gm.person_id = ro.person_id
      and gm.membership_status = 'active'
    join public.groups g on g.id = ra.group_id
    where ra.status = 'active'
      and g.archived_at is null
      and rp.state = 'open'
      and ro.payment_status = 'unpaid'
      and person.linked_user_id is not null
      and rp.due_date in (p_today, p_today + 7)
      and rp.period_start >= date_trunc('month', ra.start_date)::date
      and (ra.end_date is null or rp.due_date <= ra.end_date)
  ), inserted as (
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
    )
    select
      candidate.recipient_user_id,
      null,
      case candidate.reminder_kind
        when 'due' then 'recurring_payment_due'
        else 'recurring_payment_due_soon'
      end,
      case candidate.reminder_kind
        when 'due' then 'Payment due today'
        else 'Payment due in 1 week'
      end,
      case candidate.reminder_kind
        when 'due' then format(
          'You need to pay RM %s for %s today.',
          to_char(candidate.share_amount, 'FM999999990.00'),
          candidate.recurring_name
        )
        else format(
          'You need to pay RM %s for %s by %s.',
          to_char(candidate.share_amount, 'FM999999990.00'),
          candidate.recurring_name,
          to_char(candidate.due_date, 'FMDD Mon YYYY')
        )
      end,
      candidate.group_id,
      'recurring',
      candidate.arrangement_id,
      jsonb_build_object(
        'actor_name', 'SplitHutang',
        'actor_avatar_color', 'bg-blue-600',
        'actor_avatar_path', null,
        'recurring_name', candidate.recurring_name,
        'group_name', candidate.group_name,
        'amount', candidate.share_amount,
        'period_start', candidate.period_start,
        'due_date', candidate.due_date,
        'reminder_kind', candidate.reminder_kind,
        'obligation_id', candidate.obligation_id
      ),
      format(
        'recurring-reminder:%s:%s',
        candidate.obligation_id,
        candidate.reminder_kind
      )
    from candidates candidate
    on conflict (recipient_user_id, deduplication_key)
      where deduplication_key is not null
    do nothing
    returning id
  ), queued as (
    insert into public.notification_push_outbox (notification_id)
    select inserted.id
    from inserted
    on conflict (notification_id) do nothing
    returning notification_id
  )
  select count(*)::integer into v_created from queued;

  return v_created;
end;
$$;

comment on function public.create_recurring_due_notifications(date) is
  'Creates idempotent recurring payment reminders seven days before and on the due date for active, unpaid obligations only.';

revoke all on function public.create_recurring_due_notifications(date)
  from public, anon, authenticated;
grant execute on function public.create_recurring_due_notifications(date)
  to service_role;
