-- Load only people who may be reused in a new group. This avoids selecting
-- the whole people table through the historical-visibility RLS policy.

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

grant execute
on function public.get_group_member_candidates()
to authenticated;
