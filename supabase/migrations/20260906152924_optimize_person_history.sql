-- =========================================================
-- SPLITHUTANG PERSON HISTORY PERFORMANCE
-- =========================================================
-- Moves Person Details joins, payment aggregation and
-- pagination into PostgreSQL while preserving historical
-- visibility between the signed-in user and selected person.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Supporting indexes
-- ---------------------------------------------------------

create index if not exists
idx_expense_participants_person_expense
on public.expense_participants (
  person_id,
  expense_id
);


create index if not exists
idx_ious_people_created_at
on public.ious (
  from_person_id,
  to_person_id,
  created_at desc
);


create index if not exists
idx_expense_payments_confirmed_direct
on public.expense_payments (
  from_person_id,
  to_person_id,
  paid_at desc
)
include (
  expense_id,
  amount,
  note
)
where status = 'confirmed';


create index if not exists
idx_iou_payments_confirmed_direct
on public.iou_payments (
  from_person_id,
  to_person_id,
  paid_at desc
)
include (
  iou_id,
  amount,
  note
)
where status = 'confirmed';


-- ---------------------------------------------------------
-- 2. Shared Expense history
-- ---------------------------------------------------------

create or replace function
public.get_person_shared_expenses(
  p_person_id uuid,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  expense_id uuid,
  name text,
  expense_date date,
  total_amount numeric,
  paid_by uuid,
  group_id uuid,
  created_at timestamptz,
  self_share numeric,
  target_share numeric,
  target_paid_self numeric,
  self_paid_target numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$

with


settings as (
  select
    least(greatest(coalesce(p_limit, 30), 1), 100) as page_limit,
    greatest(coalesce(p_offset, 0), 0) as page_offset
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

target as materialized (
  select p.id as person_id
  from public.people p
  cross join identity me
  where p.id = p_person_id
    and p.id <> me.person_id
  limit 1
),

shared_expenses as materialized (
  select
    e.id,
    e.name,
    e.expense_date,
    e.total_amount,
    e.paid_by,
    e.group_id,
    e.created_at,
    self_ep.share_amount as self_share,
    target_ep.share_amount as target_share
  from public.expenses e
  cross join identity me
  cross join target other_person
  join public.expense_participants self_ep
    on self_ep.expense_id = e.id
   and self_ep.person_id = me.person_id
  join public.expense_participants target_ep
    on target_ep.expense_id = e.id
   and target_ep.person_id = other_person.person_id
),

payment_sums as materialized (
  select
    pay.expense_id,

    coalesce(
      sum(pay.amount) filter (
        where pay.from_person_id = other_person.person_id
          and pay.to_person_id = me.person_id
      ),
      0
    ) as target_paid_self,

    coalesce(
      sum(pay.amount) filter (
        where pay.from_person_id = me.person_id
          and pay.to_person_id = other_person.person_id
      ),
      0
    ) as self_paid_target

  from public.expense_payments pay
  join shared_expenses e
    on e.id = pay.expense_id
  cross join identity me
  cross join target other_person
  where pay.status = 'confirmed'
  group by pay.expense_id
),

result as (
  select
    e.id as expense_id,
    e.name,
    e.expense_date,
    e.total_amount,
    e.paid_by,
    e.group_id,
    e.created_at,
    e.self_share,
    e.target_share,
    coalesce(pay.target_paid_self, 0) as target_paid_self,
    coalesce(pay.self_paid_target, 0) as self_paid_target,
    count(*) over () as total_count
  from shared_expenses e
  left join payment_sums pay
    on pay.expense_id = e.id
)

select *
from result
order by
  expense_date desc,
  created_at desc
limit (select page_limit from settings)
offset (select page_offset from settings);

$$;


revoke all
on function public.get_person_shared_expenses(uuid, integer, integer)
from public;


grant execute
on function public.get_person_shared_expenses(uuid, integer, integer)
to authenticated;


-- ---------------------------------------------------------
-- 3. Direct IOU history
-- ---------------------------------------------------------

create or replace function
public.get_person_ious(
  p_person_id uuid,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  iou_id uuid,
  reason text,
  iou_date date,
  original_amount numeric,
  paid_amount numeric,
  from_person_id uuid,
  to_person_id uuid,
  group_id uuid,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$

with


settings as (
  select
    least(greatest(coalesce(p_limit, 30), 1), 100) as page_limit,
    greatest(coalesce(p_offset, 0), 0) as page_offset
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

target as materialized (
  select p.id as person_id
  from public.people p
  cross join identity me
  where p.id = p_person_id
    and p.id <> me.person_id
  limit 1
),

direct_ious as materialized (
  select i.*
  from public.ious i
  cross join identity me
  cross join target other_person
  where
    (
      i.from_person_id = me.person_id
      and i.to_person_id = other_person.person_id
    )
    or
    (
      i.from_person_id = other_person.person_id
      and i.to_person_id = me.person_id
    )
),

payment_sums as materialized (
  select
    pay.iou_id,
    sum(pay.amount) as paid_amount
  from public.iou_payments pay
  join direct_ious i
    on i.id = pay.iou_id
   and pay.from_person_id = i.from_person_id
   and pay.to_person_id = i.to_person_id
  where pay.status = 'confirmed'
  group by pay.iou_id
),

result as (
  select
    i.id as iou_id,
    i.reason,
    i.iou_date,
    i.amount as original_amount,
    coalesce(pay.paid_amount, 0) as paid_amount,
    i.from_person_id,
    i.to_person_id,
    i.group_id,
    i.created_at,
    count(*) over () as total_count
  from direct_ious i
  left join payment_sums pay
    on pay.iou_id = i.id
)

select *
from result
order by
  iou_date desc,
  created_at desc
limit (select page_limit from settings)
offset (select page_offset from settings);

$$;


revoke all
on function public.get_person_ious(uuid, integer, integer)
from public;


grant execute
on function public.get_person_ious(uuid, integer, integer)
to authenticated;


-- ---------------------------------------------------------
-- 4. Direct confirmed-payment history
-- ---------------------------------------------------------

create or replace function
public.get_person_payment_history(
  p_person_id uuid,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  payment_id uuid,
  payment_type text,
  amount numeric,
  paid_at timestamptz,
  note text,
  from_person_id uuid,
  to_person_id uuid,
  context text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$

with


settings as (
  select
    least(greatest(coalesce(p_limit, 30), 1), 100) as page_limit,
    greatest(coalesce(p_offset, 0), 0) as page_offset
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

target as materialized (
  select p.id as person_id
  from public.people p
  cross join identity me
  where p.id = p_person_id
    and p.id <> me.person_id
  limit 1
),

shared_expenses as materialized (
  select
    e.id,
    e.name
  from public.expenses e
  cross join identity me
  cross join target other_person
  join public.expense_participants self_ep
    on self_ep.expense_id = e.id
   and self_ep.person_id = me.person_id
  join public.expense_participants target_ep
    on target_ep.expense_id = e.id
   and target_ep.person_id = other_person.person_id
),

direct_ious as materialized (
  select
    i.id,
    i.reason
  from public.ious i
  cross join identity me
  cross join target other_person
  where
    (
      i.from_person_id = me.person_id
      and i.to_person_id = other_person.person_id
    )
    or
    (
      i.from_person_id = other_person.person_id
      and i.to_person_id = me.person_id
    )
),

payments as materialized (
  select
    pay.id as payment_id,
    'expense'::text as payment_type,
    pay.amount,
    pay.paid_at,
    pay.note,
    pay.from_person_id,
    pay.to_person_id,
    e.name as context
  from public.expense_payments pay
  join shared_expenses e
    on e.id = pay.expense_id
  cross join identity me
  cross join target other_person
  where pay.status = 'confirmed'
    and (
      (
        pay.from_person_id = me.person_id
        and pay.to_person_id = other_person.person_id
      )
      or
      (
        pay.from_person_id = other_person.person_id
        and pay.to_person_id = me.person_id
      )
    )

  union all

  select
    pay.id as payment_id,
    'iou'::text as payment_type,
    pay.amount,
    pay.paid_at,
    pay.note,
    pay.from_person_id,
    pay.to_person_id,
    i.reason as context
  from public.iou_payments pay
  join direct_ious i
    on i.id = pay.iou_id
  cross join identity me
  cross join target other_person
  where pay.status = 'confirmed'
    and (
      (
        pay.from_person_id = me.person_id
        and pay.to_person_id = other_person.person_id
      )
      or
      (
        pay.from_person_id = other_person.person_id
        and pay.to_person_id = me.person_id
      )
    )
),

result as (
  select
    payment_id,
    payment_type,
    amount,
    paid_at,
    note,
    from_person_id,
    to_person_id,
    context,
    count(*) over () as total_count
  from payments
)

select *
from result
order by paid_at desc
limit (select page_limit from settings)
offset (select page_offset from settings);

$$;


revoke all
on function public.get_person_payment_history(uuid, integer, integer)
from public;


grant execute
on function public.get_person_payment_history(uuid, integer, integer)
to authenticated;


analyze public.expense_participants;
analyze public.expense_payments;
analyze public.ious;
analyze public.iou_payments;
