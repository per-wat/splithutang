-- =========================================================
-- STAGE B — CANONICAL IDENTITY ARCHITECTURE
-- =========================================================


-- ---------------------------------------------------------
-- 1. Names must not act as identity keys.
--
-- Two different contacts may legitimately have the
-- same name.
-- ---------------------------------------------------------

alter table public.people
drop constraint if exists people_owner_id_name_key;


-- ---------------------------------------------------------
-- 2. For users we already linked manually, preserve the
-- nice contact name as their profile display name.
--
-- Example:
-- Ahmad contact = "Ahmad"
-- Ahmad profile generated from email = "ahmad123"
--
-- We keep "Ahmad".
-- ---------------------------------------------------------

update public.profiles pr
set
  display_name = trim(p.name),
  updated_at = now()
from public.people p
where p.linked_user_id = pr.id
  and trim(p.name) <> ''
  and pr.display_name is distinct from trim(p.name);


-- ---------------------------------------------------------
-- 3. Re-home all existing linked identities.
--
-- IMPORTANT:
-- people.id DOES NOT CHANGE.
--
-- Therefore all existing:
-- - group memberships
-- - expenses
-- - participants
-- - IOUs
-- - payments
--
-- remain valid.
-- ---------------------------------------------------------

update public.people p
set
  owner_id = p.linked_user_id,
  name = pr.display_name,
  updated_at = now()
from public.profiles pr
where p.linked_user_id = pr.id
  and (
    p.owner_id is distinct from p.linked_user_id
    or p.name is distinct from pr.display_name
  );


-- ---------------------------------------------------------
-- 4. Any existing profile without a linked people record
-- gets its canonical identity now.
-- ---------------------------------------------------------

insert into public.people (
  owner_id,
  name,
  linked_user_id
)
select
  pr.id,
  pr.display_name,
  pr.id
from public.profiles pr
where not exists (
  select 1
  from public.people p
  where p.linked_user_id = pr.id
);


-- ---------------------------------------------------------
-- 5. Enforce identity rule permanently.
--
-- Linked identity must always be self-owned.
-- ---------------------------------------------------------

alter table public.people
drop constraint if exists people_linked_identity_owner_check;

alter table public.people
add constraint people_linked_identity_owner_check
check (
  linked_user_id is null
  or owner_id = linked_user_id
)
not valid;

alter table public.people
validate constraint people_linked_identity_owner_check;


-- ---------------------------------------------------------
-- 6. Profile names cannot be blank.
-- ---------------------------------------------------------

update public.profiles
set
  display_name = trim(display_name),
  updated_at = now()
where display_name is distinct from trim(display_name);


alter table public.profiles
drop constraint if exists profiles_display_name_not_blank;

alter table public.profiles
add constraint profiles_display_name_not_blank
check (
  length(trim(display_name)) > 0
);


-- ---------------------------------------------------------
-- 7. Normalize profile names automatically.
-- ---------------------------------------------------------

create or replace function public.normalize_profile_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name :=
    trim(new.display_name);

  if new.display_name = '' then
    raise exception
      'Display name cannot be empty';
  end if;

  return new;
end;
$$;


drop trigger if exists
normalize_profile_display_name
on public.profiles;


create trigger
normalize_profile_display_name
before insert or update of display_name
on public.profiles
for each row
execute function
public.normalize_profile_display_name();


-- ---------------------------------------------------------
-- 8. Profile is the source of truth for authenticated
-- person's real name.
--
-- Updating:
--
-- profiles.display_name
--
-- automatically updates:
--
-- people.name
-- ---------------------------------------------------------

create or replace function public.sync_profile_identity_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if new.display_name
     is distinct from old.display_name then

    update public.people
    set
      name = new.display_name,
      updated_at = now()
    where linked_user_id = new.id;

  end if;

  return new;
end;
$$;


drop trigger if exists
sync_profile_identity_name
on public.profiles;


create trigger
sync_profile_identity_name
after update of display_name
on public.profiles
for each row
execute function
public.sync_profile_identity_name();


-- ---------------------------------------------------------
-- 9. New Auth users now automatically get:
--
-- auth.users
-- profiles
-- people
--
-- No manual UUID linking.
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin

  v_display_name :=
    trim(
      coalesce(
        nullif(
          new.raw_user_meta_data
            ->> 'display_name',
          ''
        ),

        split_part(
          coalesce(
            new.email,
            'User'
          ),
          '@',
          1
        )
      )
    );

  if v_display_name = '' then
    v_display_name := 'User';
  end if;


  insert into public.profiles (
    id,
    display_name
  )
  values (
    new.id,
    v_display_name
  )
  on conflict (id)
  do update
  set
    display_name =
      excluded.display_name,

    updated_at =
      now();


  insert into public.people (
    owner_id,
    name,
    linked_user_id
  )
  values (
    new.id,
    v_display_name,
    new.id
  )
  on conflict (linked_user_id)
  do update
  set
    owner_id =
      excluded.owner_id,

    name =
      excluded.name,

    updated_at =
      now();


  return new;

end;
$$;


drop trigger if exists
on_auth_user_created
on auth.users;


create trigger
on_auth_user_created
after insert
on auth.users
for each row
execute function
public.handle_new_user();


-- ---------------------------------------------------------
-- 10. Canonical current-person helper.
-- ---------------------------------------------------------

create or replace function private.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$

  select p.id
  from public.people p
  where p.linked_user_id =
    (select auth.uid())
  limit 1;

$$;


revoke all
on function private.current_person_id()
from public;


grant execute
on function private.current_person_id()
to authenticated;


-- ---------------------------------------------------------
-- 11. Group membership now uses canonical identity.
-- ---------------------------------------------------------

create or replace function private.is_group_member(
  p_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

  select

    private.is_group_owner(
      p_group_id
    )

    or exists (

      select 1

      from public.group_members gm

      where gm.group_id =
        p_group_id

        and gm.person_id =
          private.current_person_id()

    );

$$;


revoke all
on function private.is_group_member(uuid)
from public;


grant execute
on function private.is_group_member(uuid)
to authenticated;


-- ---------------------------------------------------------
-- 12. Reassert Expense visibility.
--
-- Owner:
-- all expenses in owned group.
--
-- Member:
-- only expenses they personally participate in.
-- ---------------------------------------------------------

create or replace function private.can_view_expense(
  p_expense_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

  select exists (

    select 1

    from public.expenses e

    where e.id = p_expense_id

      and (

        private.is_group_owner(
          e.group_id
        )

        or

        e.owner_id =
          (select auth.uid())

        or (

          private.is_group_member(
            e.group_id
          )

          and exists (

            select 1

            from public.expense_participants ep

            where
              ep.expense_id = e.id

              and ep.person_id =
                private.current_person_id()

          )

        )

      )

  );

$$;


-- ---------------------------------------------------------
-- 13. Reassert IOU visibility.
-- ---------------------------------------------------------

create or replace function private.can_view_iou(
  p_iou_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

  select exists (

    select 1

    from public.ious i

    where i.id = p_iou_id

      and (

        private.is_group_owner(
          i.group_id
        )

        or

        i.owner_id =
          (select auth.uid())

        or (

          private.is_group_member(
            i.group_id
          )

          and

          private.current_person_id()
            in (
              i.from_person_id,
              i.to_person_id
            )

        )

      )

  );

$$;


revoke all
on function private.can_view_expense(uuid)
from public;

revoke all
on function private.can_view_iou(uuid)
from public;


grant execute
on function private.can_view_expense(uuid)
to authenticated;

grant execute
on function private.can_view_iou(uuid)
to authenticated;


-- ---------------------------------------------------------
-- 14. Replace People RLS.
--
-- You may:
--
-- - always read your canonical identity
-- - manage unlinked contacts you created
-- - read members of groups you can access
--
-- You may NOT directly edit another linked user's
-- identity.
-- ---------------------------------------------------------

drop policy if exists
people_select
on public.people;

drop policy if exists
people_insert
on public.people;

drop policy if exists
people_update
on public.people;

drop policy if exists
people_delete
on public.people;


create policy people_select
on public.people
for select
to authenticated
using (

  linked_user_id =
    (select auth.uid())

  or

  owner_id =
    (select auth.uid())

  or

  exists (

    select 1

    from public.group_members gm

    where gm.person_id =
      people.id

      and private.is_group_member(
        gm.group_id
      )

  )

);


-- Users may create LOCAL contacts only.
create policy people_insert
on public.people
for insert
to authenticated
with check (

  owner_id =
    (select auth.uid())

  and

  linked_user_id is null

);


-- Users may edit LOCAL contacts only.
--
-- Linked users edit themselves through profiles.
create policy people_update
on public.people
for update
to authenticated
using (

  owner_id =
    (select auth.uid())

  and linked_user_id is null

)
with check (

  owner_id =
    (select auth.uid())

  and linked_user_id is null

);


-- Canonical linked identity may not be deleted
-- directly by the client.
create policy people_delete
on public.people
for delete
to authenticated
using (

  owner_id =
    (select auth.uid())

  and linked_user_id is null

);


-- ---------------------------------------------------------
-- 15. Small identity health-check RPC.
-- ---------------------------------------------------------

create or replace function public.has_my_identity()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$

  select exists (

    select 1

    from public.people p

    where p.linked_user_id =
      (select auth.uid())

      and p.owner_id =
        (select auth.uid())

  );

$$;


revoke all
on function public.has_my_identity()
from public;


grant execute
on function public.has_my_identity()
to authenticated;