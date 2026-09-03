-- SplitHutang / SplitMate
-- Revised Stage A stabilization
-- Adds payment approval workflow + optional group-level debtor self-confirm,
-- fixes payment race conditions, and locks down expense child-table writes.

-- ---------------------------------------------------------------------------
-- 1. Payment status + group setting
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.payment_status as enum (
    'pending',
    'confirmed',
    'rejected'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.groups
  add column if not exists allow_debtor_self_confirm boolean
  not null
  default false;

alter table public.expense_payments
  add column if not exists status public.payment_status
    not null default 'confirmed',
  add column if not exists submitted_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists resolved_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz;

alter table public.iou_payments
  add column if not exists status public.payment_status
    not null default 'confirmed',
  add column if not exists submitted_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists resolved_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz;

-- Existing payment rows pre-date approval workflow and were already treated
-- as settled payments. Keep that behaviour.
update public.expense_payments
set resolved_at = coalesce(resolved_at, paid_at)
where status = 'confirmed'
  and resolved_at is null;

update public.iou_payments
set resolved_at = coalesce(resolved_at, paid_at)
where status = 'confirmed'
  and resolved_at is null;

create index if not exists idx_expense_payments_expense_status
  on public.expense_payments(expense_id, status);

create index if not exists idx_iou_payments_iou_status
  on public.iou_payments(iou_id, status);


-- ---------------------------------------------------------------------------
-- 2. Lock down direct writes to expense child records
--    create_expense() is SECURITY DEFINER and remains the write path.
-- ---------------------------------------------------------------------------

revoke insert, update, delete
on public.expense_participants
from authenticated;

revoke insert, update, delete
on public.expense_items
from authenticated;

revoke insert, update, delete
on public.expense_item_participants
from authenticated;

revoke insert, update, delete
on public.expense_item_addons
from authenticated;

drop policy if exists expense_participants_insert
on public.expense_participants;

drop policy if exists expense_participants_update
on public.expense_participants;

drop policy if exists expense_participants_delete
on public.expense_participants;

drop policy if exists expense_items_insert
on public.expense_items;

drop policy if exists expense_items_update
on public.expense_items;

drop policy if exists expense_items_delete
on public.expense_items;

drop policy if exists expense_item_participants_insert
on public.expense_item_participants;

drop policy if exists expense_item_participants_update
on public.expense_item_participants;

drop policy if exists expense_item_participants_delete
on public.expense_item_participants;

drop policy if exists expense_item_addons_insert
on public.expense_item_addons;

drop policy if exists expense_item_addons_update
on public.expense_item_addons;

drop policy if exists expense_item_addons_delete
on public.expense_item_addons;


-- Payment rows also remain RPC-only.
revoke insert, update, delete
on public.expense_payments
from authenticated;

revoke insert, update, delete
on public.iou_payments
from authenticated;

drop policy if exists expense_payments_insert
on public.expense_payments;

drop policy if exists expense_payments_update
on public.expense_payments;

drop policy if exists expense_payments_delete
on public.expense_payments;

drop policy if exists iou_payments_insert
on public.iou_payments;

drop policy if exists iou_payments_update
on public.iou_payments;

drop policy if exists iou_payments_delete
on public.iou_payments;


-- ---------------------------------------------------------------------------
-- 3. Balances: ONLY confirmed payments reduce debt
-- ---------------------------------------------------------------------------

create or replace function public.get_people_balances()
returns table (
  person_id uuid,
  name text,
  avatar_color text,
  balance numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  self_people as (
    select p.id
    from public.people p
    where p.linked_user_id = (select auth.uid())
  ),

  visible_people as (
    select
      p.id,
      p.name,
      p.avatar_color
    from public.people p
    where not exists (
      select 1
      from self_people sp
      where sp.id = p.id
    )
  ),

  expense_debts as (
    select
      ep.person_id as debtor_id,
      e.paid_by as creditor_id,
      greatest(
        ep.share_amount
        -
        coalesce(
          (
            select sum(pay.amount)
            from public.expense_payments pay
            where pay.expense_id = e.id
              and pay.from_person_id = ep.person_id
              and pay.to_person_id = e.paid_by
              and pay.status = 'confirmed'
          ),
          0
        ),
        0
      ) as outstanding
    from public.expenses e
    join public.expense_participants ep
      on ep.expense_id = e.id
    where ep.person_id <> e.paid_by
  ),

  expense_effects as (
    select
      ed.debtor_id as person_id,
      ed.outstanding as delta
    from expense_debts ed
    where exists (
      select 1
      from self_people sp
      where sp.id = ed.creditor_id
    )

    union all

    select
      ed.creditor_id as person_id,
      -ed.outstanding as delta
    from expense_debts ed
    where exists (
      select 1
      from self_people sp
      where sp.id = ed.debtor_id
    )
  ),

  iou_debts as (
    select
      i.from_person_id as debtor_id,
      i.to_person_id as creditor_id,
      greatest(
        i.amount
        -
        coalesce(
          (
            select sum(pay.amount)
            from public.iou_payments pay
            where pay.iou_id = i.id
              and pay.from_person_id = i.from_person_id
              and pay.to_person_id = i.to_person_id
              and pay.status = 'confirmed'
          ),
          0
        ),
        0
      ) as outstanding
    from public.ious i
  ),

  iou_effects as (
    select
      idb.debtor_id as person_id,
      idb.outstanding as delta
    from iou_debts idb
    where exists (
      select 1
      from self_people sp
      where sp.id = idb.creditor_id
    )

    union all

    select
      idb.creditor_id as person_id,
      -idb.outstanding as delta
    from iou_debts idb
    where exists (
      select 1
      from self_people sp
      where sp.id = idb.debtor_id
    )
  ),

  all_effects as (
    select * from expense_effects
    union all
    select * from iou_effects
  )

  select
    vp.id as person_id,
    vp.name,
    vp.avatar_color,
    coalesce(sum(ae.delta), 0)::numeric(12,2) as balance
  from visible_people vp
  left join all_effects ae
    on ae.person_id = vp.id
  group by
    vp.id,
    vp.name,
    vp.avatar_color
  order by vp.name;
$$;

revoke all
on function public.get_people_balances()
from public;

grant execute
on function public.get_people_balances()
to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Expense overview: ONLY confirmed payments reduce outstanding shares
--    Keep the current-user "You" display behaviour from the identity fix.
-- ---------------------------------------------------------------------------

create or replace function public.get_expenses_overview()
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
security invoker
set search_path = ''
as $$
  with self_people as (
    select p.id
    from public.people p
    where p.linked_user_id = (select auth.uid())
  ),

  participant_outstanding as (
    select
      e.id as expense_id,
      ep.person_id,
      greatest(
        ep.share_amount
        -
        coalesce(
          (
            select sum(pay.amount)
            from public.expense_payments pay
            where pay.expense_id = e.id
              and pay.from_person_id = ep.person_id
              and pay.to_person_id = e.paid_by
              and pay.status = 'confirmed'
          ),
          0
        ),
        0
      ) as outstanding
    from public.expenses e
    join public.expense_participants ep
      on ep.expense_id = e.id
    where ep.person_id <> e.paid_by
  )

  select
    e.id as expense_id,
    e.name,
    e.expense_date,
    e.total_amount,

    case
      when payer.linked_user_id = (select auth.uid())
        then 'You'
      else payer.name
    end as paid_by_name,

    case
      when exists (
        select 1
        from self_people sp
        where sp.id = e.paid_by
      )
      and exists (
        select 1
        from participant_outstanding po
        where po.expense_id = e.id
          and po.outstanding > 0
          and not exists (
            select 1
            from self_people sp
            where sp.id = po.person_id
          )
      )
      then 'owed-to-me'

      when exists (
        select 1
        from self_people sp
        where sp.id = e.paid_by
      )
      then 'settled'

      when exists (
        select 1
        from participant_outstanding po
        where po.expense_id = e.id
          and po.outstanding > 0
          and exists (
            select 1
            from self_people sp
            where sp.id = po.person_id
          )
      )
      then 'i-owe'

      when exists (
        select 1
        from public.expense_participants ep
        where ep.expense_id = e.id
          and exists (
            select 1
            from self_people sp
            where sp.id = ep.person_id
          )
      )
      then 'settled'

      else 'group'
    end as status,

    case
      when exists (
        select 1
        from self_people sp
        where sp.id = e.paid_by
      )
      then (
        select count(*)
        from participant_outstanding po
        where po.expense_id = e.id
          and po.outstanding > 0
          and not exists (
            select 1
            from self_people sp
            where sp.id = po.person_id
          )
      )
      else 0
    end as unpaid_count,

    e.created_at

  from public.expenses e
  join public.people payer
    on payer.id = e.paid_by

  order by e.expense_date desc, e.created_at desc;
$$;

revoke all
on function public.get_expenses_overview()
from public;

grant execute
on function public.get_expenses_overview()
to authenticated;


-- ---------------------------------------------------------------------------
-- 5. IOU overview: ONLY confirmed payments reduce outstanding IOUs
-- ---------------------------------------------------------------------------

create or replace function public.get_ious_overview()
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
security invoker
set search_path = ''
as $$
  with self_people as (
    select p.id
    from public.people p
    where p.linked_user_id = (select auth.uid())
  ),

  iou_balances as (
    select
      i.id,
      i.reason,
      i.iou_date,
      i.amount,
      i.from_person_id,
      i.to_person_id,
      i.created_at,

      greatest(
        i.amount
        -
        coalesce(
          (
            select sum(pay.amount)
            from public.iou_payments pay
            where pay.iou_id = i.id
              and pay.from_person_id = i.from_person_id
              and pay.to_person_id = i.to_person_id
              and pay.status = 'confirmed'
          ),
          0
        ),
        0
      ) as outstanding

    from public.ious i
  )

  select
    ib.id as iou_id,
    ib.reason,
    ib.iou_date,
    ib.amount as original_amount,
    ib.outstanding as outstanding_amount,

    case
      when from_person.linked_user_id = (select auth.uid())
        then 'You'
      else from_person.name
    end as from_name,

    case
      when to_person.linked_user_id = (select auth.uid())
        then 'You'
      else to_person.name
    end as to_name,

    case
      when exists (
        select 1
        from self_people sp
        where sp.id = ib.to_person_id
      )
      and ib.outstanding > 0
      then 'owed-to-me'

      when exists (
        select 1
        from self_people sp
        where sp.id = ib.from_person_id
      )
      and ib.outstanding > 0
      then 'i-owe'

      when exists (
        select 1
        from self_people sp
        where sp.id = ib.from_person_id
           or sp.id = ib.to_person_id
      )
      and ib.outstanding = 0
      then 'settled'

      else 'group'
    end as status,

    ib.created_at

  from iou_balances ib
  join public.people from_person
    on from_person.id = ib.from_person_id
  join public.people to_person
    on to_person.id = ib.to_person_id

  order by ib.iou_date desc, ib.created_at desc;
$$;

revoke all
on function public.get_ious_overview()
from public;

grant execute
on function public.get_ious_overview()
to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Expense payment submission
--
-- Receiver recording money received:
--   -> confirmed immediately
--
-- Debtor recording their own payment:
--   -> pending by default
--   -> confirmed immediately if group.allow_debtor_self_confirm = true
--
-- Pending + confirmed payments reserve the debt amount so duplicate requests
-- cannot overpay while a payment is waiting for approval.
-- ---------------------------------------------------------------------------

create or replace function public.record_expense_payment(
  p_expense_id uuid,
  p_from_person_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();

  v_group_id uuid;
  v_paid_by uuid;
  v_allow_debtor_self_confirm boolean;

  v_self_person_id uuid;

  v_share_amount numeric;
  v_reserved_amount numeric;
  v_available_amount numeric;

  v_status public.payment_status;
  v_payment_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  -- Lock the expense row so concurrent submissions/reviews serialize.
  select
    e.group_id,
    e.paid_by,
    g.allow_debtor_self_confirm
  into
    v_group_id,
    v_paid_by,
    v_allow_debtor_self_confirm
  from public.expenses e
  join public.groups g
    on g.id = e.group_id
  where e.id = p_expense_id
  for update of e;

  if v_group_id is null then
    raise exception 'Expense not found';
  end if;

  if p_from_person_id = v_paid_by then
    raise exception 'The expense payer does not owe themselves';
  end if;

  -- Resolve the authenticated user's person identity inside this group.
  select p.id
  into v_self_person_id
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where p.linked_user_id = v_user_id
    and gm.group_id = v_group_id
  limit 1;

  if v_self_person_id is null then
    raise exception 'You are not a member of this group';
  end if;

  -- Only the debtor themselves or the receiver/payer can submit a payment.
  if v_self_person_id <> p_from_person_id
     and v_self_person_id <> v_paid_by then
    raise exception 'You cannot record a payment for this person';
  end if;

  select ep.share_amount
  into v_share_amount
  from public.expense_participants ep
  where ep.expense_id = p_expense_id
    and ep.person_id = p_from_person_id;

  if v_share_amount is null then
    raise exception 'Person is not a participant in this expense';
  end if;

  -- Pending requests reserve amount too, even though they do not affect
  -- balances until confirmed.
  select coalesce(sum(ep.amount), 0)
  into v_reserved_amount
  from public.expense_payments ep
  where ep.expense_id = p_expense_id
    and ep.from_person_id = p_from_person_id
    and ep.to_person_id = v_paid_by
    and ep.status in ('pending', 'confirmed');

  v_available_amount :=
    greatest(v_share_amount - v_reserved_amount, 0);

  if v_available_amount <= 0 then
    raise exception 'No additional payment can be submitted for this share';
  end if;

  if p_amount > v_available_amount then
    raise exception
      'Payment cannot exceed the available amount of RM %',
      to_char(v_available_amount, 'FM999999990.00');
  end if;

  if v_self_person_id = v_paid_by then
    -- Receiver is recording money they received.
    v_status := 'confirmed';
  elsif v_allow_debtor_self_confirm then
    -- Group explicitly trusts debtors to self-confirm.
    v_status := 'confirmed';
  else
    -- Safer default: receiver must confirm.
    v_status := 'pending';
  end if;

  insert into public.expense_payments (
    expense_id,
    from_person_id,
    to_person_id,
    amount,
    note,
    status,
    submitted_by_user_id,
    resolved_by_user_id,
    resolved_at
  )
  values (
    p_expense_id,
    p_from_person_id,
    v_paid_by,
    p_amount,
    nullif(trim(coalesce(p_note, '')), ''),
    v_status,
    v_user_id,
    case when v_status = 'confirmed' then v_user_id else null end,
    case when v_status = 'confirmed' then now() else null end
  )
  returning id
  into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all
on function public.record_expense_payment(
  uuid,
  uuid,
  numeric,
  text
)
from public;

grant execute
on function public.record_expense_payment(
  uuid,
  uuid,
  numeric,
  text
)
to authenticated;


-- ---------------------------------------------------------------------------
-- 7. Expense payment review
--    Only the actual receiver/payer can confirm or reject a pending payment.
-- ---------------------------------------------------------------------------

create or replace function public.review_expense_payment(
  p_payment_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();

  v_expense_id uuid;
  v_group_id uuid;
  v_from_person_id uuid;
  v_to_person_id uuid;
  v_paid_by uuid;
  v_amount numeric;
  v_status public.payment_status;

  v_self_person_id uuid;
  v_share_amount numeric;
  v_confirmed_amount numeric;
  v_remaining numeric;

  v_decision text := lower(trim(coalesce(p_decision, '')));
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if v_decision not in ('confirmed', 'rejected') then
    raise exception 'Decision must be confirmed or rejected';
  end if;

  -- Lock both payment and parent expense.
  select
    ep.expense_id,
    e.group_id,
    ep.from_person_id,
    ep.to_person_id,
    e.paid_by,
    ep.amount,
    ep.status
  into
    v_expense_id,
    v_group_id,
    v_from_person_id,
    v_to_person_id,
    v_paid_by,
    v_amount,
    v_status
  from public.expense_payments ep
  join public.expenses e
    on e.id = ep.expense_id
  where ep.id = p_payment_id
  for update of e, ep;

  if v_expense_id is null then
    raise exception 'Payment not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'Only pending payments can be reviewed';
  end if;

  if v_to_person_id <> v_paid_by then
    raise exception 'Invalid expense payment receiver';
  end if;

  select p.id
  into v_self_person_id
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where p.linked_user_id = v_user_id
    and gm.group_id = v_group_id
  limit 1;

  if v_self_person_id is null then
    raise exception 'You are not a member of this group';
  end if;

  if v_self_person_id <> v_to_person_id then
    raise exception 'Only the payment receiver can review this payment';
  end if;

  if v_decision = 'confirmed' then
    select ep.share_amount
    into v_share_amount
    from public.expense_participants ep
    where ep.expense_id = v_expense_id
      and ep.person_id = v_from_person_id;

    if v_share_amount is null then
      raise exception 'Expense participant not found';
    end if;

    select coalesce(sum(ep.amount), 0)
    into v_confirmed_amount
    from public.expense_payments ep
    where ep.expense_id = v_expense_id
      and ep.from_person_id = v_from_person_id
      and ep.to_person_id = v_to_person_id
      and ep.status = 'confirmed';

    v_remaining :=
      greatest(v_share_amount - v_confirmed_amount, 0);

    if v_amount > v_remaining then
      raise exception
        'Payment can no longer be confirmed because only RM % remains',
        to_char(v_remaining, 'FM999999990.00');
    end if;

    update public.expense_payments
    set
      status = 'confirmed',
      resolved_by_user_id = v_user_id,
      resolved_at = now()
    where id = p_payment_id;
  else
    update public.expense_payments
    set
      status = 'rejected',
      resolved_by_user_id = v_user_id,
      resolved_at = now()
    where id = p_payment_id;
  end if;
end;
$$;

revoke all
on function public.review_expense_payment(uuid, text)
from public;

grant execute
on function public.review_expense_payment(uuid, text)
to authenticated;


-- ---------------------------------------------------------------------------
-- 8. IOU payment submission
-- ---------------------------------------------------------------------------

create or replace function public.record_iou_payment(
  p_iou_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();

  v_group_id uuid;
  v_from_person_id uuid;
  v_to_person_id uuid;
  v_iou_amount numeric;
  v_allow_debtor_self_confirm boolean;

  v_self_person_id uuid;

  v_reserved_amount numeric;
  v_available_amount numeric;

  v_status public.payment_status;
  v_payment_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  -- Lock IOU so concurrent submissions/reviews serialize.
  select
    i.group_id,
    i.from_person_id,
    i.to_person_id,
    i.amount,
    g.allow_debtor_self_confirm
  into
    v_group_id,
    v_from_person_id,
    v_to_person_id,
    v_iou_amount,
    v_allow_debtor_self_confirm
  from public.ious i
  join public.groups g
    on g.id = i.group_id
  where i.id = p_iou_id
  for update of i;

  if v_group_id is null then
    raise exception 'IOU not found';
  end if;

  select p.id
  into v_self_person_id
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where p.linked_user_id = v_user_id
    and gm.group_id = v_group_id
  limit 1;

  if v_self_person_id is null then
    raise exception 'You are not a member of this group';
  end if;

  if v_self_person_id <> v_from_person_id
     and v_self_person_id <> v_to_person_id then
    raise exception 'You cannot record a payment for this IOU';
  end if;

  select coalesce(sum(ip.amount), 0)
  into v_reserved_amount
  from public.iou_payments ip
  where ip.iou_id = p_iou_id
    and ip.from_person_id = v_from_person_id
    and ip.to_person_id = v_to_person_id
    and ip.status in ('pending', 'confirmed');

  v_available_amount :=
    greatest(v_iou_amount - v_reserved_amount, 0);

  if v_available_amount <= 0 then
    raise exception 'No additional payment can be submitted for this IOU';
  end if;

  if p_amount > v_available_amount then
    raise exception
      'Payment cannot exceed the available amount of RM %',
      to_char(v_available_amount, 'FM999999990.00');
  end if;

  if v_self_person_id = v_to_person_id then
    v_status := 'confirmed';
  elsif v_allow_debtor_self_confirm then
    v_status := 'confirmed';
  else
    v_status := 'pending';
  end if;

  insert into public.iou_payments (
    iou_id,
    from_person_id,
    to_person_id,
    amount,
    note,
    status,
    submitted_by_user_id,
    resolved_by_user_id,
    resolved_at
  )
  values (
    p_iou_id,
    v_from_person_id,
    v_to_person_id,
    p_amount,
    nullif(trim(coalesce(p_note, '')), ''),
    v_status,
    v_user_id,
    case when v_status = 'confirmed' then v_user_id else null end,
    case when v_status = 'confirmed' then now() else null end
  )
  returning id
  into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all
on function public.record_iou_payment(
  uuid,
  numeric,
  text
)
from public;

grant execute
on function public.record_iou_payment(
  uuid,
  numeric,
  text
)
to authenticated;


-- ---------------------------------------------------------------------------
-- 9. IOU payment review
-- ---------------------------------------------------------------------------

create or replace function public.review_iou_payment(
  p_payment_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();

  v_iou_id uuid;
  v_group_id uuid;
  v_from_person_id uuid;
  v_to_person_id uuid;
  v_iou_amount numeric;
  v_amount numeric;
  v_status public.payment_status;

  v_self_person_id uuid;
  v_confirmed_amount numeric;
  v_remaining numeric;

  v_decision text := lower(trim(coalesce(p_decision, '')));
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if v_decision not in ('confirmed', 'rejected') then
    raise exception 'Decision must be confirmed or rejected';
  end if;

  select
    ip.iou_id,
    i.group_id,
    ip.from_person_id,
    ip.to_person_id,
    i.amount,
    ip.amount,
    ip.status
  into
    v_iou_id,
    v_group_id,
    v_from_person_id,
    v_to_person_id,
    v_iou_amount,
    v_amount,
    v_status
  from public.iou_payments ip
  join public.ious i
    on i.id = ip.iou_id
  where ip.id = p_payment_id
  for update of i, ip;

  if v_iou_id is null then
    raise exception 'Payment not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'Only pending payments can be reviewed';
  end if;

  select p.id
  into v_self_person_id
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where p.linked_user_id = v_user_id
    and gm.group_id = v_group_id
  limit 1;

  if v_self_person_id is null then
    raise exception 'You are not a member of this group';
  end if;

  if v_self_person_id <> v_to_person_id then
    raise exception 'Only the payment receiver can review this payment';
  end if;

  if v_decision = 'confirmed' then
    select coalesce(sum(ip.amount), 0)
    into v_confirmed_amount
    from public.iou_payments ip
    where ip.iou_id = v_iou_id
      and ip.from_person_id = v_from_person_id
      and ip.to_person_id = v_to_person_id
      and ip.status = 'confirmed';

    v_remaining :=
      greatest(v_iou_amount - v_confirmed_amount, 0);

    if v_amount > v_remaining then
      raise exception
        'Payment can no longer be confirmed because only RM % remains',
        to_char(v_remaining, 'FM999999990.00');
    end if;

    update public.iou_payments
    set
      status = 'confirmed',
      resolved_by_user_id = v_user_id,
      resolved_at = now()
    where id = p_payment_id;
  else
    update public.iou_payments
    set
      status = 'rejected',
      resolved_by_user_id = v_user_id,
      resolved_at = now()
    where id = p_payment_id;
  end if;
end;
$$;

revoke all
on function public.review_iou_payment(uuid, text)
from public;

grant execute
on function public.review_iou_payment(uuid, text)
to authenticated;
