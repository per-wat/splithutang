-- Keep list-style People queries aligned with people RLS: only active group
-- memberships establish a current relationship. Historical transaction access
-- remains governed separately by private.can_view_person().

create or replace function public.get_people_balances()
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
    where gm.membership_status = 'active'
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
      and gm.membership_status = 'active'
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
grant execute on function public.get_people_balances() to authenticated;


create or replace function public.get_group_member_candidates()
returns table (
  person_id uuid,
  name text,
  avatar_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  current_identity as (
    select
      (select auth.uid()) as user_id,
      (
        select p.id
        from public.people p
        where p.linked_user_id = (select auth.uid())
        limit 1
      ) as person_id
  ),

  accessible_group_ids as (
    select g.id
    from public.groups g
    cross join current_identity me
    where me.user_id is not null
      and g.owner_id = me.user_id

    union

    select gm.group_id
    from public.group_members gm
    cross join current_identity me
    where me.person_id is not null
      and gm.person_id = me.person_id
      and gm.membership_status = 'active'
  ),

  candidate_ids as (
    select p.id
    from public.people p
    cross join current_identity me
    where me.user_id is not null
      and p.owner_id = me.user_id
      and p.linked_user_id is null

    union

    select gm.person_id
    from public.group_members gm
    where gm.group_id in (select id from accessible_group_ids)
      and gm.membership_status = 'active'
  )

  select
    person.id as person_id,
    person.name,
    person.avatar_color
  from candidate_ids candidate
  join public.people person on person.id = candidate.id
  cross join current_identity me
  where me.user_id is not null
    and person.id is distinct from me.person_id
  order by person.name;
$$;

revoke all on function public.get_group_member_candidates() from public;
grant execute on function public.get_group_member_candidates() to authenticated;


-- Delete only genuinely unused local contacts. A SECURITY DEFINER function is
-- required so the operation can remove inactive membership audit rows while
-- still enforcing ownership and all business rules itself.
create or replace function public.delete_local_contact(
  p_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_linked_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select p.linked_user_id
  into v_linked_user_id
  from public.people p
  where p.id = p_person_id
    and p.owner_id = v_user_id
  for update;

  if not found then
    raise exception 'Local contact not found';
  end if;

  if v_linked_user_id is not null then
    raise exception 'A contact with a SplitHutang account cannot be deleted';
  end if;

  if exists (
    select 1
    from public.group_members gm
    where gm.person_id = p_person_id
      and gm.membership_status = 'active'
  ) then
    raise exception 'Remove this contact from every group before deleting it';
  end if;

  if exists (
    select 1
    from public.expenses e
    where e.paid_by = p_person_id
  )
  or exists (
    select 1
    from public.expense_participants ep
    where ep.person_id = p_person_id
  )
  or exists (
    select 1
    from public.expense_item_participants eip
    where eip.person_id = p_person_id
  )
  or exists (
    select 1
    from public.expense_payments pay
    where p_person_id in (pay.from_person_id, pay.to_person_id)
  )
  or exists (
    select 1
    from public.ious i
    where p_person_id in (i.from_person_id, i.to_person_id)
  )
  or exists (
    select 1
    from public.iou_payments pay
    where p_person_id in (pay.from_person_id, pay.to_person_id)
  ) then
    raise exception 'This contact has financial history and cannot be deleted';
  end if;

  delete from public.people p
  where p.id = p_person_id;
end;
$$;

revoke all on function public.delete_local_contact(uuid) from public;
grant execute on function public.delete_local_contact(uuid) to authenticated;

-- All user-facing contact deletion must pass through the guarded RPC above.
revoke delete on table public.people from authenticated;

drop policy if exists people_delete on public.people;
