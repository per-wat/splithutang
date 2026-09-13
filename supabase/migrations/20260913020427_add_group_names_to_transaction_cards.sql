-- Add group names to the existing optimized transaction summaries without
-- introducing extra page requests or per-card queries.

create or replace function public.get_expenses_overview_with_group()
returns table (
  expense_id uuid,
  name text,
  expense_date date,
  total_amount numeric,
  paid_by_name text,
  status text,
  unpaid_count bigint,
  created_at timestamptz,
  group_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    overview.expense_id,
    overview.name,
    overview.expense_date,
    overview.total_amount,
    overview.paid_by_name,
    overview.status,
    overview.unpaid_count,
    overview.created_at,
    groups.name as group_name
  from public.get_expenses_overview() overview
  join public.expenses expenses
    on expenses.id = overview.expense_id
  join public.groups groups
    on groups.id = expenses.group_id
  order by
    overview.expense_date desc,
    overview.created_at desc;
$$;

revoke all
on function public.get_expenses_overview_with_group()
from public, anon;

grant execute
on function public.get_expenses_overview_with_group()
to authenticated;


create or replace function public.get_ious_overview_with_group()
returns table (
  iou_id uuid,
  reason text,
  iou_date date,
  original_amount numeric,
  outstanding_amount numeric,
  from_name text,
  to_name text,
  status text,
  created_at timestamptz,
  group_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    overview.iou_id,
    overview.reason,
    overview.iou_date,
    overview.original_amount,
    overview.outstanding_amount,
    overview.from_name,
    overview.to_name,
    overview.status,
    overview.created_at,
    groups.name as group_name
  from public.get_ious_overview() overview
  join public.ious ious
    on ious.id = overview.iou_id
  join public.groups groups
    on groups.id = ious.group_id
  order by
    overview.iou_date desc,
    overview.created_at desc;
$$;

revoke all
on function public.get_ious_overview_with_group()
from public, anon;

grant execute
on function public.get_ious_overview_with_group()
to authenticated;


create or replace function public.get_recent_activity_with_group(
  p_limit integer default 5
)
returns table (
  activity_id uuid,
  activity_type text,
  title text,
  activity_date date,
  amount numeric,
  created_at timestamptz,
  group_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    activity.activity_id,
    activity.activity_type,
    activity.title,
    activity.activity_date,
    activity.amount,
    activity.created_at,
    groups.name as group_name
  from public.get_recent_activity(p_limit) activity
  left join public.expenses expenses
    on activity.activity_type = 'expense'
   and expenses.id = activity.activity_id
  left join public.ious ious
    on activity.activity_type = 'iou'
   and ious.id = activity.activity_id
  join public.groups groups
    on groups.id = coalesce(expenses.group_id, ious.group_id)
  order by activity.created_at desc;
$$;

revoke all
on function public.get_recent_activity_with_group(integer)
from public, anon;

grant execute
on function public.get_recent_activity_with_group(integer)
to authenticated;
