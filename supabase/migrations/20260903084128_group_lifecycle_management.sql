-- =========================================================
-- GROUP LIFECYCLE MANAGEMENT
-- =========================================================
--
-- Adds:
--
--   ✓ archive / restore group
--   ✓ membership lifecycle
--   ✓ leave group
--   ✓ safe member removal
--   ✓ ownership transfer
--   ✓ archived-group transaction protection
--   ✓ financial-history hard-delete protection
--
-- Financial history is NEVER deleted by these actions.
-- =========================================================


-- =========================================================
-- 1. MEMBERSHIP STATUS
-- =========================================================

do $$
begin

  create type
    public.group_membership_status
  as enum (
    'active',
    'left',
    'removed'
  );

exception
  when duplicate_object then
    null;

end
$$;


alter table public.group_members

add column if not exists
  membership_status
    public.group_membership_status
    not null
    default 'active';


alter table public.group_members

add column if not exists
  ended_at timestamptz;


alter table public.group_members

add column if not exists
  ended_by_user_id uuid
    references public.profiles(id)
    on delete set null;


create index if not exists
idx_group_members_active_group

on public.group_members (
  group_id,
  person_id
)

where membership_status =
  'active';


create index if not exists
idx_group_members_active_person

on public.group_members (
  person_id,
  group_id
)

where membership_status =
  'active';


-- =========================================================
-- 2. GROUP ARCHIVE STATE
-- =========================================================

alter table public.groups

add column if not exists
  archived_at timestamptz;


alter table public.groups

add column if not exists
  archived_by_user_id uuid
    references public.profiles(id)
    on delete set null;


create index if not exists
idx_groups_archived_at

on public.groups (
  archived_at
);


-- =========================================================
-- 3. PROTECT FINANCIAL HISTORY FROM HARD DELETE
--
-- Original schema:
--
-- expenses.group_id → ON DELETE CASCADE
-- ious.group_id     → ON DELETE CASCADE
--
-- Change both to RESTRICT.
-- =========================================================

alter table public.expenses
drop constraint if exists
expenses_group_id_fkey;


alter table public.expenses
add constraint
expenses_group_id_fkey

foreign key (
  group_id
)

references public.groups(id)

on delete restrict;


alter table public.ious
drop constraint if exists
ious_group_id_fkey;


alter table public.ious
add constraint
ious_group_id_fkey

foreign key (
  group_id
)

references public.groups(id)

on delete restrict;


-- =========================================================
-- 4. ACTIVE GROUP MEMBER HELPER
--
-- private.is_group_member() now means:
--
-- CURRENT active member
--
-- This is for current group access and new activity.
-- Historical transaction visibility is handled separately.
-- =========================================================

create or replace function
private.is_group_member(
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

        and gm.membership_status =
          'active'

    );

$$;


revoke all
on function
private.is_group_member(uuid)
from public;


grant execute
on function
private.is_group_member(uuid)
to authenticated;


-- =========================================================
-- 5. HISTORICAL EXPENSE VISIBILITY
--
-- A former member must still see an Expense they personally
-- participated in.
--
-- Active membership is NOT required for historical access.
-- =========================================================

create or replace function
private.can_view_expense(
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

    where e.id =
      p_expense_id

      and (

        -- Current group owner sees all.
        private.is_group_owner(
          e.group_id
        )


        -- Original transaction creator.
        or e.owner_id =
          (select auth.uid())


        -- Historical participant.
        or exists (

          select 1

          from public.expense_participants ep

          where ep.expense_id =
              e.id

            and ep.person_id =
              private.current_person_id()

        )


        -- Historical payer.
        or e.paid_by =
          private.current_person_id()

      )

  );

$$;


revoke all
on function
private.can_view_expense(uuid)
from public;


grant execute
on function
private.can_view_expense(uuid)
to authenticated;


-- =========================================================
-- 6. HISTORICAL IOU VISIBILITY
-- =========================================================

create or replace function
private.can_view_iou(
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

    where i.id =
      p_iou_id

      and (

        private.is_group_owner(
          i.group_id
        )

        or i.owner_id =
          (select auth.uid())

        or private.current_person_id()
          in (
            i.from_person_id,
            i.to_person_id
          )

      )

  );

$$;


revoke all
on function
private.can_view_iou(uuid)
from public;


grant execute
on function
private.can_view_iou(uuid)
to authenticated;


-- =========================================================
-- 7. GROUP MEMBER ROLE VALIDATION
--
-- Owner must:
--
-- ✓ represent groups.owner_id
-- ✓ be active
-- =========================================================

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

  where g.id =
    new.group_id;


  if v_group_owner_id
     is null
  then

    raise exception
      'Group not found';

  end if;


  select p.linked_user_id

  into v_person_user_id

  from public.people p

  where p.id =
    new.person_id;


  if new.role =
     'owner'
  then

    if v_person_user_id
       is distinct from
       v_group_owner_id
    then

      raise exception
        'Only the group owner identity can have the owner role';

    end if;


    if new.membership_status <>
       'active'
    then

      raise exception
        'The group owner must remain an active member';

    end if;


  else

    if v_person_user_id =
       v_group_owner_id
    then

      raise exception
        'The group owner must have the owner role';

    end if;

  end if;


  return new;

end;
$$;


revoke all
on function
public.validate_group_member_role()
from public, anon, authenticated;


-- Existing trigger remains attached to this replaced function.


-- =========================================================
-- 8. VALIDATE NEW EXPENSE PAYER
--
-- Archived group:
--   cannot create new Expense.
--
-- Existing historical rows can still be identity-migrated.
-- =========================================================

create or replace function
public.validate_expense_paid_by()
returns trigger

language plpgsql
set search_path = ''

as $$
declare

  v_archived_at timestamptz;

begin

  /*
   * Archive check only when creating/moving a transaction.
   *
   * Do NOT block identity-claim updates to old history.
   */
  if tg_op = 'INSERT'
     or new.group_id
        is distinct from
        old.group_id
  then

    select g.archived_at

    into v_archived_at

    from public.groups g

    where g.id =
      new.group_id;


    if v_archived_at
       is not null
    then

      raise exception
        'Archived groups cannot create new expenses';

    end if;

  end if;


  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        new.group_id

      and gm.person_id =
        new.paid_by

      and gm.membership_status =
        'active'

  ) then

    raise exception
      'Payer must be an active member of the expense group';

  end if;


  return new;

end;
$$;


revoke all
on function
public.validate_expense_paid_by()
from public, anon, authenticated;


-- =========================================================
-- 9. VALIDATE EXPENSE PARTICIPANTS
-- =========================================================

create or replace function
public.validate_expense_group_people()
returns trigger

language plpgsql
set search_path = ''

as $$
declare

  v_group_id uuid;

begin

  select e.group_id

  into v_group_id

  from public.expenses e

  where e.id =
    new.expense_id;


  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        v_group_id

      and gm.person_id =
        new.person_id

      and gm.membership_status =
        'active'

  ) then

    raise exception
      'Expense participant must be an active group member';

  end if;


  return new;

end;
$$;


revoke all
on function
public.validate_expense_group_people()
from public, anon, authenticated;


-- =========================================================
-- 10. ITEM PARTICIPANT VALIDATION
-- =========================================================

create or replace function
public.validate_expense_item_group_person()
returns trigger

language plpgsql
set search_path = ''

as $$
declare

  v_group_id uuid;

begin

  select e.group_id

  into v_group_id

  from public.expense_items ei

  join public.expenses e
    on e.id =
      ei.expense_id

  where ei.id =
    new.expense_item_id;


  if v_group_id
     is null
  then

    raise exception
      'Expense item not found';

  end if;


  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        v_group_id

      and gm.person_id =
        new.person_id

      and gm.membership_status =
        'active'

  ) then

    raise exception
      'Item participant must be an active group member';

  end if;


  return new;

end;
$$;


drop trigger if exists
validate_expense_item_participant_group
on public.expense_item_participants;


create trigger
validate_expense_item_participant_group

before insert or update
on public.expense_item_participants

for each row

execute function
public.validate_expense_item_group_person();


revoke all
on function
public.validate_expense_item_group_person()
from public, anon, authenticated;


-- =========================================================
-- 11. VALIDATE NEW IOUs
-- =========================================================

create or replace function
public.validate_iou_group_people()
returns trigger

language plpgsql
set search_path = ''

as $$
declare

  v_archived_at timestamptz;

begin

  if tg_op = 'INSERT'
     or new.group_id
        is distinct from
        old.group_id
  then

    select g.archived_at

    into v_archived_at

    from public.groups g

    where g.id =
      new.group_id;


    if v_archived_at
       is not null
    then

      raise exception
        'Archived groups cannot create new IOUs';

    end if;

  end if;


  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        new.group_id

      and gm.person_id =
        new.from_person_id

      and gm.membership_status =
        'active'

  ) then

    raise exception
      'IOU debtor must be an active group member';

  end if;


  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        new.group_id

      and gm.person_id =
        new.to_person_id

      and gm.membership_status =
        'active'

  ) then

    raise exception
      'IOU creditor must be an active group member';

  end if;


  return new;

end;
$$;


revoke all
on function
public.validate_iou_group_people()
from public, anon, authenticated;


-- =========================================================
-- 12. CHECK WHETHER A PERSON STILL HAS AN OPEN FINANCIAL
-- RELATIONSHIP IN A GROUP
--
-- We check each obligation individually.
--
-- We DO NOT merely calculate a single net balance because:
--
-- Person owes Ahmad RM50
-- Sarah owes Person RM50
--
-- Net = RM0
--
-- but both obligations are still open.
-- =========================================================

create or replace function
private.has_open_group_obligations(

  p_group_id uuid,

  p_person_id uuid

)
returns boolean

language sql
stable
security definer
set search_path = ''

as $$

  select


  -- -------------------------------------------------------
  -- Person owes expense payer.
  -- -------------------------------------------------------

  exists (

    select 1

    from public.expenses e

    join public.expense_participants ep

      on ep.expense_id =
        e.id

    where e.group_id =
        p_group_id

      and ep.person_id =
        p_person_id

      and ep.person_id <>
        e.paid_by

      and ep.share_amount >

        coalesce(
          (

            select
              sum(pay.amount)

            from public.expense_payments pay

            where pay.expense_id =
                e.id

              and pay.from_person_id =
                p_person_id

              and pay.to_person_id =
                e.paid_by

              and pay.status =
                'confirmed'

          ),
          0
        )

  )


  -- -------------------------------------------------------
  -- Other people still owe this person for an Expense.
  -- -------------------------------------------------------

  or exists (

    select 1

    from public.expenses e

    join public.expense_participants ep

      on ep.expense_id =
        e.id

    where e.group_id =
        p_group_id

      and e.paid_by =
        p_person_id

      and ep.person_id <>
        p_person_id

      and ep.share_amount >

        coalesce(
          (

            select
              sum(pay.amount)

            from public.expense_payments pay

            where pay.expense_id =
                e.id

              and pay.from_person_id =
                ep.person_id

              and pay.to_person_id =
                p_person_id

              and pay.status =
                'confirmed'

          ),
          0
        )

  )


  -- -------------------------------------------------------
  -- Open IOU involving this person.
  -- -------------------------------------------------------

  or exists (

    select 1

    from public.ious i

    where i.group_id =
        p_group_id

      and p_person_id
        in (
          i.from_person_id,
          i.to_person_id
        )

      and i.amount >

        coalesce(
          (

            select
              sum(pay.amount)

            from public.iou_payments pay

            where pay.iou_id =
                i.id

              and pay.from_person_id =
                i.from_person_id

              and pay.to_person_id =
                i.to_person_id

              and pay.status =
                'confirmed'

          ),
          0
        )

  );

$$;


revoke all
on function
private.has_open_group_obligations(
  uuid,
  uuid
)
from public;


-- =========================================================
-- 13. ARCHIVE GROUP
--
-- Outstanding balances are allowed.
--
-- Why?
--
-- Archive means:
--
-- "Stop creating new activity"
--
-- not:
--
-- "Everything must already be settled"
--
-- Existing repayments remain usable.
-- =========================================================

create or replace function
public.archive_group(
  p_group_id uuid
)
returns void

language plpgsql
security definer
set search_path = ''

as $$
begin

  if auth.uid()
     is null
  then

    raise exception
      'You must be signed in';

  end if;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the group owner can archive this group';

  end if;


  update public.groups

  set

    archived_at =
      coalesce(
        archived_at,
        now()
      ),

    archived_by_user_id =
      coalesce(
        archived_by_user_id,
        auth.uid()
      )

  where id =
    p_group_id;


  if not found then

    raise exception
      'Group not found';

  end if;


  /*
   * No active invitation should survive an archive.
   */

  update public.group_invites

  set

    status =
      'revoked',

    revoked_at =
      now()

  where group_id =
      p_group_id

    and status =
      'pending';

end;
$$;


revoke all
on function
public.archive_group(uuid)
from public;


grant execute
on function
public.archive_group(uuid)
to authenticated;


-- =========================================================
-- 14. RESTORE / UNARCHIVE GROUP
-- =========================================================

create or replace function
public.unarchive_group(
  p_group_id uuid
)
returns void

language plpgsql
security definer
set search_path = ''

as $$
begin

  if auth.uid()
     is null
  then

    raise exception
      'You must be signed in';

  end if;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the group owner can restore this group';

  end if;


  update public.groups

  set

    archived_at =
      null,

    archived_by_user_id =
      null

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
public.unarchive_group(uuid)
from public;


grant execute
on function
public.unarchive_group(uuid)
to authenticated;


-- =========================================================
-- 15. TRANSFER OWNERSHIP
--
-- New owner MUST:
--
-- ✓ currently be active
-- ✓ already belong to the group
-- ✓ have a real linked SplitHutang account
--
-- Local contacts cannot own groups.
-- =========================================================

create or replace function
public.transfer_group_ownership(

  p_group_id uuid,

  p_new_owner_person_id uuid

)
returns void

language plpgsql
security definer
set search_path = ''

as $$
declare

  v_old_owner_person_id uuid;

  v_new_owner_user_id uuid;

begin

  if auth.uid()
     is null
  then

    raise exception
      'You must be signed in';

  end if;


  /*
   * Lock group lifecycle state.
   */
  perform 1

  from public.groups g

  where g.id =
    p_group_id

  for update;


  if not
    private.is_group_owner(
      p_group_id
    )
  then

    raise exception
      'Only the current owner can transfer ownership';

  end if;


  v_old_owner_person_id :=
    private.current_person_id();


  if p_new_owner_person_id =
     v_old_owner_person_id
  then

    raise exception
      'You already own this group';

  end if;


  /*
   * Target must be ACTIVE member.
   */
  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        p_group_id

      and gm.person_id =
        p_new_owner_person_id

      and gm.membership_status =
        'active'

      and gm.role =
        'member'

  ) then

    raise exception
      'New owner must be an active group member';

  end if;


  /*
   * Target must have a real account.
   */
  select p.linked_user_id

  into v_new_owner_user_id

  from public.people p

  where p.id =
    p_new_owner_person_id;


  if v_new_owner_user_id
     is null
  then

    raise exception
      'Ownership can only be transferred to a member with a SplitHutang account';

  end if;


  /*
   * IMPORTANT ORDER:
   *
   * 1. Change groups.owner_id
   * 2. Old owner → member
   * 3. New owner → owner
   *
   * This works safely with:
   *
   * - role validation trigger
   * - one-owner unique index
   */

  update public.groups

  set owner_id =
    v_new_owner_user_id

  where id =
    p_group_id;


  update public.group_members

  set role =
    'member'

  where group_id =
      p_group_id

    and person_id =
      v_old_owner_person_id;


  update public.group_members

  set

    role =
      'owner',

    membership_status =
      'active',

    ended_at =
      null,

    ended_by_user_id =
      null

  where group_id =
      p_group_id

    and person_id =
      p_new_owner_person_id;


end;
$$;


revoke all
on function
public.transfer_group_ownership(
  uuid,
  uuid
)
from public;


grant execute
on function
public.transfer_group_ownership(
  uuid,
  uuid
)
to authenticated;


-- =========================================================
-- 16. LEAVE GROUP
--
-- Owner cannot leave.
--
-- Owner must first:
--
-- Transfer Ownership
--        ↓
-- Leave Group
--
-- Member cannot leave while money is still unresolved.
-- =========================================================

create or replace function
public.leave_group(
  p_group_id uuid
)
returns void

language plpgsql
security definer
set search_path = ''

as $$
declare

  v_person_id uuid;

  v_role
    public.group_member_role;

  v_status
    public.group_membership_status;

begin

  if auth.uid()
     is null
  then

    raise exception
      'You must be signed in';

  end if;


  v_person_id :=
    private.current_person_id();


  if v_person_id
     is null
  then

    raise exception
      'Your person identity is missing';

  end if;


  select

    gm.role,

    gm.membership_status

  into

    v_role,

    v_status

  from public.group_members gm

  where gm.group_id =
      p_group_id

    and gm.person_id =
      v_person_id

  for update;


  if v_role
     is null
  then

    raise exception
      'You are not a member of this group';

  end if;


  if v_status <>
     'active'
  then

    raise exception
      'You are no longer an active member of this group';

  end if;


  if v_role =
     'owner'
  then

    raise exception
      'Transfer group ownership before leaving the group';

  end if;


  if private.has_open_group_obligations(
       p_group_id,
       v_person_id
     )
  then

    raise exception
      'You cannot leave while this group still has unsettled money involving you';

  end if;


  update public.group_members

  set

    membership_status =
      'left',

    ended_at =
      now(),

    ended_by_user_id =
      auth.uid()

  where group_id =
      p_group_id

    and person_id =
      v_person_id;


  /*
   * Defensive cleanup.
   */
  update public.group_invites

  set

    status =
      'revoked',

    revoked_at =
      now()

  where group_id =
      p_group_id

    and person_id =
      v_person_id

    and status =
      'pending';

end;
$$;


revoke all
on function
public.leave_group(uuid)
from public;


grant execute
on function
public.leave_group(uuid)
to authenticated;


-- =========================================================
-- 17. SAFE REMOVE MEMBER
--
-- Replaces Phase 1 behavior.
--
-- BEFORE:
--
-- Any historical transaction meant permanent membership.
--
-- NOW:
--
-- Historical transactions are allowed.
--
-- Only OPEN obligations block removal.
--
-- Membership record remains for audit/history.
-- =========================================================

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

  v_role
    public.group_member_role;

  v_status
    public.group_membership_status;

begin

  if auth.uid()
     is null
  then

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


  select

    gm.role,

    gm.membership_status

  into

    v_role,

    v_status

  from public.group_members gm

  where gm.group_id =
      p_group_id

    and gm.person_id =
      p_person_id

  for update;


  if v_role
     is null
  then

    raise exception
      'Person is not a member of this group';

  end if;


  if v_status <>
     'active'
  then

    raise exception
      'Person is no longer an active group member';

  end if;


  if v_role =
     'owner'
  then

    raise exception
      'The group owner cannot be removed';

  end if;


  if private.has_open_group_obligations(
       p_group_id,
       p_person_id
     )
  then

    raise exception
      'This member cannot be removed while the group still has unsettled money involving them';

  end if;


  update public.group_members

  set

    membership_status =
      'removed',

    ended_at =
      now(),

    ended_by_user_id =
      auth.uid()

  where group_id =
      p_group_id

    and person_id =
      p_person_id;


  /*
   * Revoke unused identity invitation.
   */

  update public.group_invites

  set

    status =
      'revoked',

    revoked_at =
      now()

  where group_id =
      p_group_id

    and person_id =
      p_person_id

    and status =
      'pending';

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


-- =========================================================
-- 18. ADD / RE-ACTIVATE EXISTING MEMBER
--
-- Because lifecycle memberships are retained instead of
-- deleted, ON CONFLICT now reactivates the existing record.
-- =========================================================

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
declare

  v_archived_at timestamptz;

begin

  if auth.uid()
     is null
  then

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


  select g.archived_at

  into v_archived_at

  from public.groups g

  where g.id =
    p_group_id;


  if v_archived_at
     is not null
  then

    raise exception
      'Restore the group before adding members';

  end if;


  if p_person_id =
     private.current_person_id()
  then

    return;

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

    role,

    membership_status

  )
  values (

    p_group_id,

    p_person_id,

    'member',

    'active'

  )

  on conflict (
    group_id,
    person_id
  )

  do update

  set

    role =
      'member',

    membership_status =
      'active',

    ended_at =
      null,

    ended_by_user_id =
      null;

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


-- =========================================================
-- 19. CREATE LOCAL GROUP MEMBER
--
-- Archived group cannot receive new members.
-- =========================================================

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

  v_archived_at timestamptz;

begin

  if v_user_id
     is null
  then

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


  select g.archived_at

  into v_archived_at

  from public.groups g

  where g.id =
    p_group_id;


  if v_archived_at
     is not null
  then

    raise exception
      'Restore the group before adding members';

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

    role,

    membership_status

  )
  values (

    p_group_id,

    v_person_id,

    'member',

    'active'

  );


  return
    v_person_id;

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


-- =========================================================
-- 20. INVITATION SAFETY FOR ARCHIVE / INACTIVE MEMBERS
--
-- Instead of rewriting the existing Phase 2 invite RPC,
-- enforce lifecycle validity directly at table level.
-- =========================================================

create or replace function
public.validate_group_invite_lifecycle()
returns trigger

language plpgsql
set search_path = ''

as $$
declare

  v_archived_at timestamptz;

begin

  /*
   * Only active/pending invites need lifecycle validation.
   */
  if new.status <>
     'pending'
  then

    return new;

  end if;


  select g.archived_at

  into v_archived_at

  from public.groups g

  where g.id =
    new.group_id;


  if v_archived_at
     is not null
  then

    raise exception
      'Archived groups cannot create invitations';

  end if;


  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        new.group_id

      and gm.person_id =
        new.person_id

      and gm.membership_status =
        'active'

  ) then

    raise exception
      'Only an active group member can be invited';

  end if;


  return new;

end;
$$;


drop trigger if exists
validate_group_invite_lifecycle
on public.group_invites;


create trigger
validate_group_invite_lifecycle

before insert or update
on public.group_invites

for each row

execute function
public.validate_group_invite_lifecycle();


revoke all
on function
public.validate_group_invite_lifecycle()
from public, anon, authenticated;


-- =========================================================
-- 21. REVOKE INVITE WHEN MEMBERSHIP ENDS
-- =========================================================

create or replace function
public.revoke_invite_when_membership_ends()
returns trigger

language plpgsql
security definer
set search_path = ''

as $$
begin

  if old.membership_status =
       'active'

     and

     new.membership_status <>
       'active'

  then

    update public.group_invites

    set

      status =
        'revoked',

      revoked_at =
        now()

    where group_id =
        new.group_id

      and person_id =
        new.person_id

      and status =
        'pending';

  end if;


  return new;

end;
$$;


drop trigger if exists
revoke_invite_when_membership_ends
on public.group_members;


create trigger
revoke_invite_when_membership_ends

after update of membership_status
on public.group_members

for each row

execute function
public.revoke_invite_when_membership_ends();


revoke all
on function
public.revoke_invite_when_membership_ends()
from public, anon, authenticated;


-- =========================================================
-- 22. GROUPS OVERVIEW
--
-- Count ACTIVE members only.
--
-- Archived groups remain visible so the UI can show an
-- Archived section and allow restoration.
-- =========================================================

drop function if exists
public.get_groups_overview();


create function
public.get_groups_overview()
returns table (

  group_id uuid,

  name text,

  member_count bigint,

  is_owner boolean,

  allow_debtor_self_confirm boolean,

  archived_at timestamptz,

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
      filter (
        where
          gm.membership_status =
            'active'
      )
      as member_count,

    g.owner_id =
      (select auth.uid())
      as is_owner,

    g.allow_debtor_self_confirm,

    g.archived_at,

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

    g.archived_at,

    g.created_at


  order by

    (
      g.archived_at
        is not null
    ),

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