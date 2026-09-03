-- =========================================================
-- GROUP MANAGEMENT — PHASE 1
-- =========================================================


-- ---------------------------------------------------------
-- 1. Group names
-- ---------------------------------------------------------

alter table public.groups
drop constraint if exists groups_name_not_blank;

alter table public.groups
add constraint groups_name_not_blank
check (
  length(trim(name)) > 0
  and length(trim(name)) <= 80
);


-- ---------------------------------------------------------
-- 2. Groups and memberships become RPC-write-only.
--
-- SELECT remains controlled by existing RLS.
-- ---------------------------------------------------------

revoke insert, update, delete
on public.groups
from authenticated;

revoke insert, update, delete
on public.group_members
from authenticated;


drop policy if exists groups_insert
on public.groups;

drop policy if exists groups_update
on public.groups;

drop policy if exists groups_delete
on public.groups;


drop policy if exists group_members_insert
on public.group_members;

drop policy if exists group_members_update
on public.group_members;

drop policy if exists group_members_delete
on public.group_members;


-- ---------------------------------------------------------
-- 3. One owner membership per group.
-- ---------------------------------------------------------

create unique index if not exists
idx_group_members_one_owner
on public.group_members (
  group_id
)
where role = 'owner';


-- ---------------------------------------------------------
-- 4. Ensure the member marked "owner" really represents
--    groups.owner_id.
-- ---------------------------------------------------------

create or replace function
public.validate_group_member_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare

  v_group_owner_id uuid;

  v_person_user_id uuid;

begin

  select g.owner_id
  into v_group_owner_id
  from public.groups g
  where g.id = new.group_id;


  if v_group_owner_id is null then

    raise exception
      'Group not found';

  end if;


  select p.linked_user_id
  into v_person_user_id
  from public.people p
  where p.id = new.person_id;


  if new.role = 'owner' then

    if v_person_user_id
       is distinct from
       v_group_owner_id then

      raise exception
        'Only the group owner identity can have the owner role';

    end if;

  else

    if v_person_user_id =
       v_group_owner_id then

      raise exception
        'The group owner must have the owner role';

    end if;

  end if;


  return new;

end;
$$;


drop trigger if exists
validate_group_member_role
on public.group_members;


create trigger
validate_group_member_role
before insert or update
on public.group_members
for each row
execute function
public.validate_group_member_role();


revoke all
on function
public.validate_group_member_role()
from public, anon, authenticated;


-- ---------------------------------------------------------
-- 5. Can current user reuse this person in another group?
--
-- Allowed:
--
-- - current user's canonical identity
-- - local contact owned by current user
-- - somebody already shared with current user in
--   another group
-- ---------------------------------------------------------

create or replace function
private.can_use_person_for_group(
  p_person_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

  select exists (

    select 1

    from public.people p

    where p.id =
      p_person_id

      and (

        -- Myself
        p.linked_user_id =
          (select auth.uid())


        -- My local contact
        or (

          p.owner_id =
            (select auth.uid())

          and

          p.linked_user_id
            is null

        )


        -- Existing person I already share a group with
        or exists (

          select 1

          from public.group_members gm

          where gm.person_id =
            p.id

            and private.is_group_member(
              gm.group_id
            )

        )

      )

  );

$$;


revoke all
on function
private.can_use_person_for_group(uuid)
from public;


-- ---------------------------------------------------------
-- 6. Groups overview
-- ---------------------------------------------------------

create or replace function
public.get_groups_overview()
returns table (

  group_id uuid,

  name text,

  member_count bigint,

  is_owner boolean,

  allow_debtor_self_confirm boolean,

  created_at timestamptz

)
language sql
stable
security invoker
set search_path = ''
as $$

  select

    g.id
      as group_id,

    g.name,

    count(
      gm.person_id
    )
      as member_count,

    g.owner_id =
      (select auth.uid())
      as is_owner,

    g.allow_debtor_self_confirm,

    g.created_at

  from public.groups g

  left join
    public.group_members gm

    on gm.group_id =
      g.id

  group by

    g.id,

    g.name,

    g.owner_id,

    g.allow_debtor_self_confirm,

    g.created_at

  order by

    g.created_at desc,

    g.name;

$$;


revoke all
on function
public.get_groups_overview()
from public;


grant execute
on function
public.get_groups_overview()
to authenticated;


-- ---------------------------------------------------------
-- 7. CREATE GROUP
--
-- Current authenticated user is automatically inserted
-- as the owner member.
-- ---------------------------------------------------------

create or replace function
public.create_group(

  p_name text,

  p_member_ids uuid[]
    default '{}'::uuid[],

  p_allow_debtor_self_confirm boolean
    default false

)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_user_id uuid :=
    auth.uid();

  v_self_person_id uuid;

  v_group_id uuid;

  v_member_id uuid;

  v_name text :=
    trim(
      coalesce(
        p_name,
        ''
      )
    );

begin

  if v_user_id is null then

    raise exception
      'You must be signed in';

  end if;


  if v_name = '' then

    raise exception
      'Group name is required';

  end if;


  if length(v_name) > 80 then

    raise exception
      'Group name cannot exceed 80 characters';

  end if;


  v_self_person_id :=
    private.current_person_id();


  if v_self_person_id is null then

    raise exception
      'Your person identity is missing';

  end if;


  -- Create group

  insert into public.groups (

    owner_id,

    name,

    allow_debtor_self_confirm

  )
  values (

    v_user_id,

    v_name,

    coalesce(
      p_allow_debtor_self_confirm,
      false
    )

  )
  returning id
  into v_group_id;


  -- Add current user as owner.

  insert into public.group_members (

    group_id,

    person_id,

    role

  )
  values (

    v_group_id,

    v_self_person_id,

    'owner'

  );


  -- Add selected members.

  for v_member_id in

    select distinct
      member_id

    from unnest(

      coalesce(
        p_member_ids,
        '{}'::uuid[]
      )

    ) as member_id

    where member_id
      is not null

      and member_id <>
        v_self_person_id

  loop


    if not
      private.can_use_person_for_group(
        v_member_id
      )
    then

      raise exception
        'You cannot add this person to the group';

    end if;


    insert into public.group_members (

      group_id,

      person_id,

      role

    )
    values (

      v_group_id,

      v_member_id,

      'member'

    )
    on conflict (
      group_id,
      person_id
    )
    do nothing;


  end loop;


  return v_group_id;

end;
$$;


revoke all
on function
public.create_group(
  text,
  uuid[],
  boolean
)
from public;


grant execute
on function
public.create_group(
  text,
  uuid[],
  boolean
)
to authenticated;


-- ---------------------------------------------------------
-- 8. UPDATE GROUP SETTINGS
--
-- Only groups.owner_id may perform this.
-- ---------------------------------------------------------

create or replace function
public.update_group_settings(

  p_group_id uuid,

  p_name text,

  p_allow_debtor_self_confirm boolean

)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_name text :=
    trim(
      coalesce(
        p_name,
        ''
      )
    );

begin

  if auth.uid() is null then

    raise exception
      'You must be signed in';

  end if;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the group owner can change group settings';

  end if;


  if v_name = '' then

    raise exception
      'Group name is required';

  end if;


  if length(v_name) > 80 then

    raise exception
      'Group name cannot exceed 80 characters';

  end if;


  update public.groups

  set

    name =
      v_name,

    allow_debtor_self_confirm =
      coalesce(
        p_allow_debtor_self_confirm,
        false
      )

  where id =
    p_group_id;


  if not found then

    raise exception
      'Group not found';

  end if;

end;
$$;


revoke all
on function
public.update_group_settings(
  uuid,
  text,
  boolean
)
from public;


grant execute
on function
public.update_group_settings(
  uuid,
  text,
  boolean
)
to authenticated;


-- ---------------------------------------------------------
-- 9. ADD EXISTING PERSON
-- ---------------------------------------------------------

create or replace function
public.add_group_member(

  p_group_id uuid,

  p_person_id uuid

)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin

  if auth.uid() is null then

    raise exception
      'You must be signed in';

  end if;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the group owner can add members';

  end if;


  if p_person_id is null then

    raise exception
      'Person is required';

  end if;


  if not
    private.can_use_person_for_group(
      p_person_id
    )
  then

    raise exception
      'You cannot add this person to the group';

  end if;


  insert into public.group_members (

    group_id,

    person_id,

    role

  )
  values (

    p_group_id,

    p_person_id,

    'member'

  )
  on conflict (
    group_id,
    person_id
  )
  do nothing;

end;
$$;


revoke all
on function
public.add_group_member(
  uuid,
  uuid
)
from public;


grant execute
on function
public.add_group_member(
  uuid,
  uuid
)
to authenticated;


-- ---------------------------------------------------------
-- 10. CREATE NEW LOCAL CONTACT + ADD TO GROUP
--
-- Used for a friend that does not have a SplitHutang
-- account yet.
-- ---------------------------------------------------------

create or replace function
public.create_local_group_member(

  p_group_id uuid,

  p_name text,

  p_avatar_color text
    default null

)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_user_id uuid :=
    auth.uid();

  v_name text :=
    trim(
      coalesce(
        p_name,
        ''
      )
    );

  v_person_id uuid;

begin

  if v_user_id is null then

    raise exception
      'You must be signed in';

  end if;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the group owner can create group contacts';

  end if;


  if v_name = '' then

    raise exception
      'Person name is required';

  end if;


  if length(v_name) > 80 then

    raise exception
      'Person name cannot exceed 80 characters';

  end if;


  insert into public.people (

    owner_id,

    name,

    avatar_color,

    linked_user_id

  )
  values (

    v_user_id,

    v_name,

    nullif(
      trim(
        coalesce(
          p_avatar_color,
          ''
        )
      ),
      ''
    ),

    null

  )
  returning id
  into v_person_id;


  insert into public.group_members (

    group_id,

    person_id,

    role

  )
  values (

    p_group_id,

    v_person_id,

    'member'

  );


  return v_person_id;

end;
$$;


revoke all
on function
public.create_local_group_member(
  uuid,
  text,
  text
)
from public;


grant execute
on function
public.create_local_group_member(
  uuid,
  text,
  text
)
to authenticated;


-- ---------------------------------------------------------
-- 11. SAFE MEMBER REMOVAL
--
-- We intentionally do NOT remove somebody who has
-- historical transactions in this group.
--
-- Removing them would otherwise interfere with historical
-- visibility and financial records.
-- ---------------------------------------------------------

create or replace function
public.remove_group_member(

  p_group_id uuid,

  p_person_id uuid

)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_self_person_id uuid;

  v_role
    public.group_member_role;

  v_has_history boolean;

begin

  if auth.uid() is null then

    raise exception
      'You must be signed in';

  end if;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the group owner can remove members';

  end if;


  v_self_person_id :=
    private.current_person_id();


  select gm.role

  into v_role

  from public.group_members gm

  where gm.group_id =
      p_group_id

    and gm.person_id =
      p_person_id;


  if v_role is null then

    raise exception
      'Person is not a member of this group';

  end if;


  if p_person_id =
       v_self_person_id

     or

     v_role = 'owner'

  then

    raise exception
      'The group owner cannot be removed';

  end if;


  select (

    -- Paid an expense
    exists (

      select 1

      from public.expenses e

      where e.group_id =
          p_group_id

        and e.paid_by =
          p_person_id

    )


    -- Expense participant
    or exists (

      select 1

      from public.expenses e

      join
        public.expense_participants ep

        on ep.expense_id =
          e.id

      where e.group_id =
          p_group_id

        and ep.person_id =
          p_person_id

    )


    -- Expense payment history
    or exists (

      select 1

      from public.expenses e

      join
        public.expense_payments ep

        on ep.expense_id =
          e.id

      where e.group_id =
          p_group_id

        and (

          ep.from_person_id =
            p_person_id

          or

          ep.to_person_id =
            p_person_id

        )

    )


    -- Item history
    or exists (

      select 1

      from public.expenses e

      join
        public.expense_items ei

        on ei.expense_id =
          e.id

      join
        public.expense_item_participants eip

        on eip.expense_item_id =
          ei.id

      where e.group_id =
          p_group_id

        and eip.person_id =
          p_person_id

    )


    -- IOU participant
    or exists (

      select 1

      from public.ious i

      where i.group_id =
          p_group_id

        and (

          i.from_person_id =
            p_person_id

          or

          i.to_person_id =
            p_person_id

        )

    )


    -- IOU payment history
    or exists (

      select 1

      from public.ious i

      join
        public.iou_payments ip

        on ip.iou_id =
          i.id

      where i.group_id =
          p_group_id

        and (

          ip.from_person_id =
            p_person_id

          or

          ip.to_person_id =
            p_person_id

        )

    )

  )
  into v_has_history;


  if v_has_history then

    raise exception
      'This member has transaction history in the group and cannot be removed';

  end if;


  delete from public.group_members

  where group_id =
      p_group_id

    and person_id =
      p_person_id;

end;
$$;


revoke all
on function
public.remove_group_member(
  uuid,
  uuid
)
from public;


grant execute
on function
public.remove_group_member(
  uuid,
  uuid
)
to authenticated;