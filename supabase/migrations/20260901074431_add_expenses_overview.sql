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
    payer.name as paid_by_name,

    case

      -- Current user paid the expense and someone still owes them.
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

      -- Current user paid it and everyone has settled.
      when exists (
        select 1
        from self_people sp
        where sp.id = e.paid_by
      )
      then 'settled'

      -- Current user participated and still owes the payer.
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

      -- Current user participated but their share has been paid.
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

      -- Group owner can see transactions that don't involve them.
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