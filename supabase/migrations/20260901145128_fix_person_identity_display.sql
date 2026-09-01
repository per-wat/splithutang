/*
 * Replace legacy people rows literally named "You"
 * with that user's real profile display name.
 */
update public.people p
set
  name = pr.display_name,
  updated_at = now()
from public.profiles pr
where p.linked_user_id = pr.id
  and lower(trim(p.name)) = 'you';


/*
 * Expenses overview:
 * only display "You" when the payer is the current user.
 */
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


/*
 * IOUs overview:
 * dynamically display "You" for whichever side is
 * the currently authenticated user.
 */
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