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
    -- Someone owes the current user.
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

    -- Current user owes someone else.
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
          ),
          0
        ),
        0
      ) as outstanding
    from public.ious i
  ),

  iou_effects as (
    -- Someone owes the current user.
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

    -- Current user owes someone else.
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

revoke all on function public.get_people_balances() from public;

grant execute
on function public.get_people_balances()
to authenticated;