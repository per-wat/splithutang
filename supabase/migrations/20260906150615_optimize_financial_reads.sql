-- =========================================================
-- SPLITHUTANG FINANCIAL READ PERFORMANCE
-- =========================================================
--
-- Preserves:
-- - current group-owner visibility
-- - original transaction-creator visibility
-- - historical payer/participant visibility after leaving
-- - all existing expense and IOU status wording
--
-- Improves:
-- - recent activity ordering
-- - confirmed-payment aggregation
-- - expense overview calculation
-- - IOU overview calculation
-- - Home activity request count
-- =========================================================


-- ---------------------------------------------------------
-- 1. Supporting indexes
-- ---------------------------------------------------------

create index if not exists
idx_expenses_created_at_desc
on public.expenses (
  created_at desc
);


create index if not exists
idx_ious_created_at_desc
on public.ious (
  created_at desc
);


create index if not exists
idx_expenses_overview_order
on public.expenses (
  expense_date desc,
  created_at desc
);


create index if not exists
idx_ious_overview_order
on public.ious (
  iou_date desc,
  created_at desc
);


create index if not exists
idx_expense_payments_confirmed_lookup
on public.expense_payments (
  expense_id,
  from_person_id,
  to_person_id
)
include (
  amount
)
where status = 'confirmed';


create index if not exists
idx_iou_payments_confirmed_lookup
on public.iou_payments (
  iou_id,
  from_person_id,
  to_person_id
)
include (
  amount
)
where status = 'confirmed';


-- ---------------------------------------------------------
-- 2. Set-based Expense overview
-- ---------------------------------------------------------

create or replace function
public.get_expenses_overview()
returns table (
  expense_id uuid,
  name text,
  expense_date date,
  total_amount numeric,
  paid_by_name text,
  status text,
  unpaid_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$

with

identity as materialized (
  select
    (select auth.uid()) as user_id,
    p.id as person_id
  from public.people p
  where p.linked_user_id =
    (select auth.uid())
  limit 1
),

visible_expenses as materialized (
  select e.*
  from public.expenses e
  cross join identity me
  where
    e.owner_id = me.user_id

    or e.paid_by = me.person_id

    or exists (
      select 1
      from public.groups g
      where g.id = e.group_id
        and g.owner_id = me.user_id
    )

    or exists (
      select 1
      from public.expense_participants ep
      where ep.expense_id = e.id
        and ep.person_id = me.person_id
    )
),

confirmed_payments as materialized (
  select
    pay.expense_id,
    pay.from_person_id,
    pay.to_person_id,
    sum(pay.amount) as paid_amount
  from public.expense_payments pay
  join visible_expenses e
    on e.id = pay.expense_id
  where pay.status = 'confirmed'
  group by
    pay.expense_id,
    pay.from_person_id,
    pay.to_person_id
),

participant_outstanding as materialized (
  select
    ep.expense_id,
    ep.person_id,
    greatest(
      ep.share_amount - coalesce(cp.paid_amount, 0),
      0
    )::numeric(12,2) as outstanding
  from public.expense_participants ep
  join visible_expenses e
    on e.id = ep.expense_id
  left join confirmed_payments cp
    on cp.expense_id = ep.expense_id
   and cp.from_person_id = ep.person_id
   and cp.to_person_id = e.paid_by
),

expense_state as (
  select
    e.id as expense_id,

    coalesce(
      bool_or(po.person_id = me.person_id),
      false
    ) as self_participates,

    coalesce(
      max(po.outstanding)
        filter (where po.person_id = me.person_id),
      0
    ) as self_outstanding,

    count(*) filter (
      where po.person_id <> me.person_id
        and po.outstanding > 0
    ) as other_unpaid_count

  from visible_expenses e
  cross join identity me
  left join participant_outstanding po
    on po.expense_id = e.id
  group by
    e.id
)

select
  e.id as expense_id,
  e.name,
  e.expense_date,
  e.total_amount,

  case
    when payer.linked_user_id = me.user_id
      then 'You'
    else payer.name
  end as paid_by_name,

  case
    when e.paid_by = me.person_id
         and state.other_unpaid_count > 0
      then 'owed-to-me'

    when e.paid_by = me.person_id
      then 'settled'

    when state.self_outstanding > 0
      then 'i-owe'

    when state.self_participates
      then 'settled'

    else 'group'
  end as status,

  case
    when e.paid_by = me.person_id
      then state.other_unpaid_count
    else 0::bigint
  end as unpaid_count,

  e.created_at

from visible_expenses e
cross join identity me
join expense_state state
  on state.expense_id = e.id
join public.people payer
  on payer.id = e.paid_by

order by
  e.expense_date desc,
  e.created_at desc;

$$;


revoke all
on function public.get_expenses_overview()
from public;


grant execute
on function public.get_expenses_overview()
to authenticated;


-- ---------------------------------------------------------
-- 3. Set-based IOU overview
-- ---------------------------------------------------------

create or replace function
public.get_ious_overview()
returns table (
  iou_id uuid,
  reason text,
  iou_date date,
  original_amount numeric,
  outstanding_amount numeric,
  from_name text,
  to_name text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$

with


identity as materialized (
  select
    (select auth.uid()) as user_id,
    p.id as person_id
  from public.people p
  where p.linked_user_id =
    (select auth.uid())
  limit 1
),

visible_ious as materialized (
  select i.*
  from public.ious i
  cross join identity me
  where
    i.owner_id = me.user_id

    or i.from_person_id = me.person_id

    or i.to_person_id = me.person_id

    or exists (
      select 1
      from public.groups g
      where g.id = i.group_id
        and g.owner_id = me.user_id
    )
),

confirmed_payments as materialized (
  select
    pay.iou_id,
    pay.from_person_id,
    pay.to_person_id,
    sum(pay.amount) as paid_amount
  from public.iou_payments pay
  join visible_ious i
    on i.id = pay.iou_id
  where pay.status = 'confirmed'
  group by
    pay.iou_id,
    pay.from_person_id,
    pay.to_person_id
),

iou_balances as (
  select
    i.*,
    greatest(
      i.amount - coalesce(cp.paid_amount, 0),
      0
    )::numeric(12,2) as outstanding
  from visible_ious i
  left join confirmed_payments cp
    on cp.iou_id = i.id
   and cp.from_person_id = i.from_person_id
   and cp.to_person_id = i.to_person_id
)

select
  i.id as iou_id,
  i.reason,
  i.iou_date,
  i.amount as original_amount,
  i.outstanding as outstanding_amount,

  case
    when from_person.linked_user_id = me.user_id
      then 'You'
    else from_person.name
  end as from_name,

  case
    when to_person.linked_user_id = me.user_id
      then 'You'
    else to_person.name
  end as to_name,

  case
    when i.to_person_id = me.person_id
         and i.outstanding > 0
      then 'owed-to-me'

    when i.from_person_id = me.person_id
         and i.outstanding > 0
      then 'i-owe'

    when me.person_id in (
      i.from_person_id,
      i.to_person_id
    ) and i.outstanding = 0
      then 'settled'

    else 'group'
  end as status,

  i.created_at

from iou_balances i
cross join identity me
join public.people from_person
  on from_person.id = i.from_person_id
join public.people to_person
  on to_person.id = i.to_person_id

order by
  i.iou_date desc,
  i.created_at desc;

$$;


revoke all
on function public.get_ious_overview()
from public;


grant execute
on function public.get_ious_overview()
to authenticated;


-- ---------------------------------------------------------
-- 4. Combined Home recent activity
-- ---------------------------------------------------------

create or replace function
public.get_recent_activity(
  p_limit integer default 5
)
returns table (
  activity_id uuid,
  activity_type text,
  title text,
  activity_date date,
  amount numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$

with


settings as (
  select least(
    greatest(coalesce(p_limit, 5), 1),
    50
  ) as result_limit
),

identity as materialized (
  select
    (select auth.uid()) as user_id,
    p.id as person_id
  from public.people p
  where p.linked_user_id =
    (select auth.uid())
  limit 1
),

recent_expenses as (
  select
    e.id as activity_id,
    'expense'::text as activity_type,
    e.name as title,
    e.expense_date as activity_date,
    e.total_amount as amount,
    e.created_at
  from public.expenses e
  cross join identity me
  where
    e.owner_id = me.user_id

    or e.paid_by = me.person_id

    or exists (
      select 1
      from public.groups g
      where g.id = e.group_id
        and g.owner_id = me.user_id
    )

    or exists (
      select 1
      from public.expense_participants ep
      where ep.expense_id = e.id
        and ep.person_id = me.person_id
    )
  order by e.created_at desc
  limit (select result_limit from settings)
),

recent_ious as (
  select
    i.id as activity_id,
    'iou'::text as activity_type,
    i.reason as title,
    i.iou_date as activity_date,
    i.amount,
    i.created_at
  from public.ious i
  cross join identity me
  where
    i.owner_id = me.user_id

    or i.from_person_id = me.person_id

    or i.to_person_id = me.person_id

    or exists (
      select 1
      from public.groups g
      where g.id = i.group_id
        and g.owner_id = me.user_id
    )
  order by i.created_at desc
  limit (select result_limit from settings)
),

combined as (
  select * from recent_expenses
  union all
  select * from recent_ious
)

select
  activity_id,
  activity_type,
  title,
  activity_date,
  amount,
  created_at
from combined
order by created_at desc
limit (select result_limit from settings);

$$;


revoke all
on function public.get_recent_activity(integer)
from public;


grant execute
on function public.get_recent_activity(integer)
to authenticated;


-- Refresh planner statistics after the performance seed.
analyze public.expenses;
analyze public.expense_participants;
analyze public.expense_payments;
analyze public.ious;
analyze public.iou_payments;
