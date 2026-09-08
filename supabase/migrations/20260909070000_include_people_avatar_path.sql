-- Return all People-list presentation data from the balance RPC so the page
-- does not need a second sequential query to public.people.

drop function if exists public.get_people_balances();

create function public.get_people_balances()
returns table (
  person_id uuid,
  name text,
  avatar_color text,
  avatar_path text,
  balance numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  self_person as (
    select p.id
    from public.people p
    where p.linked_user_id = (select auth.uid())
    limit 1
  ),

  my_groups as (
    select g.id
    from public.groups g
    where g.owner_id = (select auth.uid())

    union

    select gm.group_id
    from public.group_members gm
    join self_person sp on sp.id = gm.person_id
  ),

  visible_person_ids as (
    select p.id
    from public.people p
    where p.owner_id = (select auth.uid())
      and p.linked_user_id is null

    union

    select gm.person_id
    from public.group_members gm
    where gm.group_id in (select id from my_groups)
  ),

  visible_people as (
    select
      p.id,
      p.name,
      p.avatar_color,
      p.avatar_path
    from public.people p
    where p.id in (select id from visible_person_ids)
      and not exists (
        select 1
        from self_person sp
        where sp.id = p.id
      )
  ),

  expense_debts as (
    select
      ep.person_id as debtor_id,
      e.paid_by as creditor_id,
      greatest(
        ep.share_amount - coalesce(
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
      )::numeric(12,2) as outstanding
    from public.expenses e
    join public.expense_participants ep on ep.expense_id = e.id
    where e.group_id in (select id from my_groups)
      and ep.person_id <> e.paid_by
  ),

  expense_effects as (
    select
      ed.debtor_id as person_id,
      ed.outstanding as delta
    from expense_debts ed
    where exists (
      select 1
      from self_person sp
      where sp.id = ed.creditor_id
    )

    union all

    select
      ed.creditor_id as person_id,
      -ed.outstanding as delta
    from expense_debts ed
    where exists (
      select 1
      from self_person sp
      where sp.id = ed.debtor_id
    )
  ),

  iou_debts as (
    select
      i.from_person_id as debtor_id,
      i.to_person_id as creditor_id,
      greatest(
        i.amount - coalesce(
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
      )::numeric(12,2) as outstanding
    from public.ious i
    where i.group_id in (select id from my_groups)
  ),

  iou_effects as (
    select
      debt.debtor_id as person_id,
      debt.outstanding as delta
    from iou_debts debt
    where exists (
      select 1
      from self_person sp
      where sp.id = debt.creditor_id
    )

    union all

    select
      debt.creditor_id as person_id,
      -debt.outstanding as delta
    from iou_debts debt
    where exists (
      select 1
      from self_person sp
      where sp.id = debt.debtor_id
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
    vp.avatar_path,
    coalesce(sum(effect.delta), 0)::numeric(12,2) as balance
  from visible_people vp
  left join all_effects effect on effect.person_id = vp.id
  group by
    vp.id,
    vp.name,
    vp.avatar_color,
    vp.avatar_path
  order by vp.name;
$$;

revoke all on function public.get_people_balances() from public;

grant execute
on function public.get_people_balances()
to authenticated;
