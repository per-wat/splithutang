-- =========================================================
-- GROUP MANAGEMENT — PHASE 2
-- Invitations + canonical account claiming
-- =========================================================


-- =========================================================
-- 1. Invite status
-- =========================================================

do $$
begin

  create type
    public.group_invite_status
  as enum (
    'pending',
    'accepted',
    'revoked',
    'expired'
  );

exception
  when duplicate_object then
    null;

end
$$;


-- =========================================================
-- 2. Group invitations
-- =========================================================

create table if not exists
public.group_invites (

  id uuid
    primary key
    default gen_random_uuid(),

  token uuid
    not null
    unique
    default gen_random_uuid(),

  group_id uuid
    not null
    references public.groups(id)
    on delete cascade,

  /*
   * The LOCAL contact being invited.
   *
   * Once successfully claimed, this contact will be
   * merged into the authenticated user's canonical person.
   */
  person_id uuid
    references public.people(id)
    on delete set null,

  invited_by uuid
    not null
    references public.profiles(id)
    on delete cascade,

  email text
    not null,

  status
    public.group_invite_status
    not null
    default 'pending',

  expires_at timestamptz
    not null
    default (
      now() +
      interval '7 days'
    ),

  accepted_by uuid
    references public.profiles(id)
    on delete set null,

  /*
   * After claim, records the canonical people.id that
   * inherited the local contact.
   */
  claimed_person_id uuid
    references public.people(id)
    on delete set null,

  accepted_at timestamptz,

  revoked_at timestamptz,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint
    group_invites_email_not_blank
  check (
    length(
      trim(email)
    ) > 0
  )

);


-- =========================================================
-- 3. Invite indexes
-- =========================================================

create index if not exists
idx_group_invites_group
on public.group_invites (
  group_id,
  created_at desc
);


create index if not exists
idx_group_invites_person
on public.group_invites (
  person_id
);


create index if not exists
idx_group_invites_email
on public.group_invites (
  lower(email)
);


create unique index if not exists
idx_group_invites_one_pending_person
on public.group_invites (
  person_id
)
where
  status = 'pending'
  and person_id is not null;


-- =========================================================
-- 4. updated_at trigger
-- =========================================================

drop trigger if exists
set_group_invites_updated_at
on public.group_invites;


create trigger
set_group_invites_updated_at
before update
on public.group_invites
for each row
execute function
public.set_updated_at();


-- =========================================================
-- 5. Invitations are RPC-only.
-- =========================================================

alter table
public.group_invites
enable row level security;


revoke all
on public.group_invites
from anon, authenticated;


-- =========================================================
-- 6. CREATE INVITE
--
-- Important:
--
-- Only LOCAL contacts can be claimed.
--
-- The person must:
--
-- ✓ belong to the group
-- ✓ still be unlinked
-- ✓ be owned by the current group owner
--
-- This prevents one user from linking somebody else's
-- local contact.
-- =========================================================

create or replace function
public.create_group_invite(

  p_group_id uuid,

  p_person_id uuid,

  p_email text

)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_user_id uuid :=
    auth.uid();

  v_email text :=
    lower(
      trim(
        coalesce(
          p_email,
          ''
        )
      )
    );

  v_person_owner uuid;

  v_linked_user uuid;

  v_existing_id uuid;

  v_existing_token uuid;

  v_existing_email text;

  v_token uuid;

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
      'Only the group owner can create invitations';

  end if;


  if v_email = '' then

    raise exception
      'Email is required';

  end if;


  if length(v_email) > 254 then

    raise exception
      'Email is too long';

  end if;


  /*
   * Basic email validation.
   *
   * Full delivery validation belongs to Auth/email
   * confirmation.
   */
  if position(
    '@' in v_email
  ) <= 1 then

    raise exception
      'Enter a valid email address';

  end if;


  /*
   * Person must currently belong to this group.
   */
  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        p_group_id

      and gm.person_id =
        p_person_id

      and gm.role =
        'member'

  ) then

    raise exception
      'This person is not an eligible group member';

  end if;


  select
    p.owner_id,
    p.linked_user_id

  into
    v_person_owner,
    v_linked_user

  from public.people p

  where p.id =
    p_person_id;


  if v_person_owner is null then

    raise exception
      'Person not found';

  end if;


  if v_linked_user is not null then

    raise exception
      'This person already has a SplitHutang account';

  end if;


  /*
   * Only the owner of the LOCAL contact may start the
   * identity claim.
   */
  if v_person_owner <>
     v_user_id then

    raise exception
      'You do not own this local contact';

  end if;


  /*
   * Convert old pending-but-expired invitations first.
   */
  update public.group_invites

  set
    status =
      'expired'

  where person_id =
      p_person_id

    and status =
      'pending'

    and expires_at <=
      now();


  /*
   * Is there already an active invitation?
   */
  select

    gi.id,

    gi.token,

    lower(
      trim(
        gi.email
      )
    )

  into

    v_existing_id,

    v_existing_token,

    v_existing_email

  from public.group_invites gi

  where gi.person_id =
      p_person_id

    and gi.status =
      'pending'

    and gi.expires_at >
      now()

  order by
    gi.created_at desc

  limit 1

  for update;


  /*
   * Same person + same email:
   *
   * Reuse existing invite.
   */
  if v_existing_id
     is not null
     and v_existing_email =
       v_email
  then

    return
      v_existing_token;

  end if;


  /*
   * Email changed:
   *
   * Revoke old link before generating a replacement.
   */
  if v_existing_id
     is not null
  then

    update public.group_invites

    set

      status =
        'revoked',

      revoked_at =
        now()

    where id =
      v_existing_id;

  end if;


  insert into public.group_invites (

    group_id,

    person_id,

    invited_by,

    email

  )
  values (

    p_group_id,

    p_person_id,

    v_user_id,

    v_email

  )
  returning token
  into v_token;


  return
    v_token;

end;
$$;


revoke all
on function
public.create_group_invite(
  uuid,
  uuid,
  text
)
from public;


grant execute
on function
public.create_group_invite(
  uuid,
  uuid,
  text
)
to authenticated;


-- =========================================================
-- 7. OWNER INVITE LIST
-- =========================================================

create or replace function
public.get_group_invites(
  p_group_id uuid
)
returns table (

  invite_id uuid,

  person_id uuid,

  person_name text,

  email text,

  token uuid,

  status text,

  expires_at timestamptz,

  accepted_at timestamptz,

  claimed_person_id uuid

)
language plpgsql
stable
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
      'Only the group owner can view invitations';

  end if;


  return query

  select

    gi.id,

    gi.person_id,

    coalesce(
      local_person.name,
      claimed_person.name,
      'Member'
    ),

    gi.email,

    gi.token,

    case

      when
        gi.status = 'pending'
        and gi.expires_at <= now()
      then
        'expired'

      else
        gi.status::text

    end,

    gi.expires_at,

    gi.accepted_at,

    gi.claimed_person_id

  from public.group_invites gi

  left join public.people
    local_person

    on local_person.id =
      gi.person_id

  left join public.people
    claimed_person

    on claimed_person.id =
      gi.claimed_person_id

  where gi.group_id =
    p_group_id

  order by
    gi.created_at desc;

end;
$$;


revoke all
on function
public.get_group_invites(uuid)
from public;


grant execute
on function
public.get_group_invites(uuid)
to authenticated;


-- =========================================================
-- 8. REVOKE INVITE
-- =========================================================

create or replace function
public.revoke_group_invite(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_group_id uuid;

begin

  if auth.uid() is null then

    raise exception
      'You must be signed in';

  end if;


  select gi.group_id

  into v_group_id

  from public.group_invites gi

  where gi.id =
    p_invite_id;


  if v_group_id is null then

    raise exception
      'Invitation not found';

  end if;


  if not
    private.is_group_owner(
      v_group_id
    )
  then

    raise exception
      'Only the group owner can revoke invitations';

  end if;


  update public.group_invites

  set

    status =
      'revoked',

    revoked_at =
      now()

  where id =
      p_invite_id

    and status =
      'pending';


end;
$$;


revoke all
on function
public.revoke_group_invite(uuid)
from public;


grant execute
on function
public.revoke_group_invite(uuid)
to authenticated;


-- =========================================================
-- 9. PUBLIC INVITE PREVIEW
--
-- The token itself acts as the secret.
--
-- No private financial data is returned.
-- =========================================================

create or replace function
public.get_group_invite_preview(
  p_token uuid
)
returns table (

  group_id uuid,

  group_name text,

  contact_name text,

  email_hint text,

  status text,

  expires_at timestamptz

)
language sql
stable
security definer
set search_path = ''
as $$

  select

    g.id,

    g.name,

    coalesce(
      local_person.name,
      claimed_person.name,
      'Member'
    ),

    /*
     * Example:
     *
     * sarah@example.com
     * →
     * s***@example.com
     */
    case

      when position(
        '@' in gi.email
      ) > 1

      then

        left(
          gi.email,
          1
        )

        || '***@'

        || split_part(
          gi.email,
          '@',
          2
        )

      else
        '***'

    end,

    case

      when
        gi.status = 'pending'
        and gi.expires_at <= now()

      then
        'expired'

      else
        gi.status::text

    end,

    gi.expires_at

  from public.group_invites gi

  join public.groups g

    on g.id =
      gi.group_id

  left join public.people
    local_person

    on local_person.id =
      gi.person_id

  left join public.people
    claimed_person

    on claimed_person.id =
      gi.claimed_person_id

  where gi.token =
    p_token;

$$;


revoke all
on function
public.get_group_invite_preview(uuid)
from public;


grant execute
on function
public.get_group_invite_preview(uuid)
to anon, authenticated;


-- =========================================================
-- 10. CLAIM INVITATION
--
-- This is the critical part.
--
-- The authenticated account must use the exact email that
-- the invitation was created for.
--
-- We then MERGE the old local person into the user's
-- canonical person identity.
--
-- people.id of the canonical account survives.
-- =========================================================

create or replace function
public.claim_group_invite(
  p_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare

  v_user_id uuid :=
    auth.uid();

  v_user_email text;

  v_invite_id uuid;

  v_group_id uuid;

  v_source_person_id uuid;

  v_invite_email text;

  v_invite_status
    public.group_invite_status;

  v_expires_at timestamptz;

  v_accepted_by uuid;


  v_source_owner_id uuid;

  v_source_linked_user uuid;

  v_source_avatar_color text;


  v_target_person_id uuid;


begin

  if v_user_id is null then

    raise exception
      'You must sign in before accepting this invitation';

  end if;


  /*
   * Auth email is authoritative.
   */
  select
    lower(
      trim(
        u.email
      )
    )

  into v_user_email

  from auth.users u

  where u.id =
    v_user_id;


  if v_user_email is null then

    raise exception
      'Your account does not have an email address';

  end if;


  /*
   * Lock invitation.
   */
  select

    gi.id,

    gi.group_id,

    gi.person_id,

    lower(
      trim(
        gi.email
      )
    ),

    gi.status,

    gi.expires_at,

    gi.accepted_by

  into

    v_invite_id,

    v_group_id,

    v_source_person_id,

    v_invite_email,

    v_invite_status,

    v_expires_at,

    v_accepted_by

  from public.group_invites gi

  where gi.token =
    p_token

  for update;


  if v_invite_id is null then

    raise exception
      'Invitation not found';

  end if;


  /*
   * Idempotent result for the same account.
   */
  if v_invite_status =
       'accepted'
  then

    if v_accepted_by =
       v_user_id
    then

      return
        v_group_id;

    end if;


    raise exception
      'This invitation has already been accepted';

  end if;


  if v_invite_status =
       'revoked'
  then

    raise exception
      'This invitation has been revoked';

  end if;


  if v_invite_status =
       'expired'
  then

    raise exception
      'This invitation has expired';

  end if;


  if v_expires_at <=
     now()
  then

    update public.group_invites

    set status =
      'expired'

    where id =
      v_invite_id;


    raise exception
      'This invitation has expired';

  end if;


  /*
   * This is what prevents a forwarded/stolen invite link
   * from being claimed by another account.
   */
  if v_user_email <>
     v_invite_email
  then

    raise exception
      'This invitation belongs to a different email address';

  end if;


  if v_source_person_id
     is null
  then

    raise exception
      'The invited local contact no longer exists';

  end if;


  /*
   * Invited person must still belong to the group.
   */
  if not exists (

    select 1

    from public.group_members gm

    where gm.group_id =
        v_group_id

      and gm.person_id =
        v_source_person_id

  ) then

    raise exception
      'The invited person is no longer a member of this group';

  end if;


  /*
   * Lock source person.
   */
  select

    p.owner_id,

    p.linked_user_id,

    p.avatar_color

  into

    v_source_owner_id,

    v_source_linked_user,

    v_source_avatar_color

  from public.people p

  where p.id =
    v_source_person_id

  for update;


  if v_source_owner_id is null then

    raise exception
      'Local contact not found';

  end if;


  if v_source_linked_user
     is not null
  then

    raise exception
      'This local contact has already been linked';

  end if;


  /*
   * Canonical identity created in Stage B.
   */
  v_target_person_id :=
    private.current_person_id();


  if v_target_person_id
     is null
  then

    raise exception
      'Your canonical SplitHutang identity is missing';

  end if;


  if v_target_person_id =
     v_source_person_id
  then

    raise exception
      'This invitation is already linked to your identity';

  end if;


  -- =======================================================
  -- SAFETY CHECKS
  --
  -- A local duplicate and canonical person must not have
  -- direct debts/payments against each other.
  --
  -- Otherwise merging them would create:
  --
  -- You → You
  --
  -- which would corrupt historical meaning.
  -- =======================================================


  if exists (

    select 1

    from public.ious i

    where

      (
        i.from_person_id =
          v_source_person_id

        and

        i.to_person_id =
          v_target_person_id
      )

      or

      (
        i.from_person_id =
          v_target_person_id

        and

        i.to_person_id =
          v_source_person_id
      )

  ) then

    raise exception
      'This contact cannot be merged automatically because both identities have a direct IOU with each other';

  end if;


  if exists (

    select 1

    from public.expense_payments ep

    where

      (
        ep.from_person_id =
          v_source_person_id

        and

        ep.to_person_id =
          v_target_person_id
      )

      or

      (
        ep.from_person_id =
          v_target_person_id

        and

        ep.to_person_id =
          v_source_person_id
      )

  ) then

    raise exception
      'This contact cannot be merged automatically because both identities have direct payment history';

  end if;


  if exists (

    select 1

    from public.iou_payments ip

    where

      (
        ip.from_person_id =
          v_source_person_id

        and

        ip.to_person_id =
          v_target_person_id
      )

      or

      (
        ip.from_person_id =
          v_target_person_id

        and

        ip.to_person_id =
          v_source_person_id
      )

  ) then

    raise exception
      'This contact cannot be merged automatically because both identities have direct repayment history';

  end if;


  -- =======================================================
  -- 11. Preserve avatar if canonical account doesn't
  -- already have one.
  -- =======================================================

  update public.people

  set avatar_color =
    coalesce(
      avatar_color,
      v_source_avatar_color
    )

  where id =
    v_target_person_id;


  -- =======================================================
  -- 12. GROUP MEMBERSHIPS
  --
  -- If target already exists in a group:
  -- delete duplicate local membership.
  --
  -- Otherwise move local membership to canonical person.
  -- =======================================================

  update public.group_members gm

  set person_id =
    v_target_person_id

  where gm.person_id =
      v_source_person_id

    and not exists (

      select 1

      from public.group_members existing

      where existing.group_id =
          gm.group_id

        and existing.person_id =
          v_target_person_id

    );


  delete from public.group_members gm

  where gm.person_id =
      v_source_person_id;


  -- =======================================================
  -- 13. EXPENSE PAYER
  -- =======================================================

  update public.expenses

  set paid_by =
    v_target_person_id

  where paid_by =
    v_source_person_id;


  -- =======================================================
  -- 14. EXPENSE PARTICIPANTS
  --
  -- If both identities somehow participated in the same
  -- expense, their shares are combined.
  -- =======================================================

  update public.expense_participants target

  set share_amount =
    target.share_amount +
    source.share_amount

  from public.expense_participants source

  where source.person_id =
      v_source_person_id

    and target.person_id =
      v_target_person_id

    and target.expense_id =
      source.expense_id;


  delete from public.expense_participants source

  where source.person_id =
      v_source_person_id

    and exists (

      select 1

      from public.expense_participants target

      where target.expense_id =
          source.expense_id

        and target.person_id =
          v_target_person_id

    );


  update public.expense_participants

  set person_id =
    v_target_person_id

  where person_id =
    v_source_person_id;


  -- =======================================================
  -- 15. ITEM PARTICIPANTS
  -- =======================================================

  delete from
    public.expense_item_participants source

  where source.person_id =
      v_source_person_id

    and exists (

      select 1

      from public.expense_item_participants target

      where target.expense_item_id =
          source.expense_item_id

        and target.person_id =
          v_target_person_id

    );


  update
    public.expense_item_participants

  set person_id =
    v_target_person_id

  where person_id =
    v_source_person_id;


  -- =======================================================
  -- 16. EXPENSE PAYMENTS
  -- =======================================================

  update public.expense_payments

  set from_person_id =
    v_target_person_id

  where from_person_id =
    v_source_person_id;


  update public.expense_payments

  set to_person_id =
    v_target_person_id

  where to_person_id =
    v_source_person_id;


  -- =======================================================
  -- 17. IOUs
  -- =======================================================

  update public.ious

  set from_person_id =
    v_target_person_id

  where from_person_id =
    v_source_person_id;


  update public.ious

  set to_person_id =
    v_target_person_id

  where to_person_id =
    v_source_person_id;


  -- =======================================================
  -- 18. IOU PAYMENTS
  -- =======================================================

  update public.iou_payments

  set from_person_id =
    v_target_person_id

  where from_person_id =
    v_source_person_id;


  update public.iou_payments

  set to_person_id =
    v_target_person_id

  where to_person_id =
    v_source_person_id;


  -- =======================================================
  -- 19. Revoke any OTHER pending invitations for this
  -- local contact.
  --
  -- Claiming one identity claim applies globally to that
  -- local person and all of their historical groups.
  -- =======================================================

  update public.group_invites

  set

    status =
      'revoked',

    revoked_at =
      now()

  where person_id =
      v_source_person_id

    and status =
      'pending'

    and id <>
      v_invite_id;


  -- =======================================================
  -- 20. Mark this invitation accepted BEFORE deleting
  -- local contact.
  -- =======================================================

  update public.group_invites

  set

    status =
      'accepted',

    accepted_by =
      v_user_id,

    claimed_person_id =
      v_target_person_id,

    accepted_at =
      now()

  where id =
    v_invite_id;


  -- =======================================================
  -- 21. Delete obsolete LOCAL person.
  --
  -- All references have now moved to canonical identity.
  -- group_invites.person_id uses ON DELETE SET NULL.
  -- =======================================================

  delete from public.people

  where id =
    v_source_person_id;


  return
    v_group_id;


end;
$$;


revoke all
on function
public.claim_group_invite(uuid)
from public;


grant execute
on function
public.claim_group_invite(uuid)
to authenticated;


-- =========================================================
-- 22. If a group member is removed before accepting an
-- invitation, automatically revoke their pending invite.
-- =========================================================

create or replace function
public.revoke_invite_when_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  update public.group_invites

  set

    status =
      'revoked',

    revoked_at =
      now()

  where group_id =
      old.group_id

    and person_id =
      old.person_id

    and status =
      'pending';


  return old;

end;
$$;


drop trigger if exists
revoke_invite_when_member_removed
on public.group_members;


create trigger
revoke_invite_when_member_removed
after delete
on public.group_members
for each row
execute function
public.revoke_invite_when_member_removed();


revoke all
on function
public.revoke_invite_when_member_removed()
from public, anon, authenticated;