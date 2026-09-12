-- =========================================================
-- EMAIL-FREE ONE-TIME GROUP INVITATIONS
--
-- New invitations are protected by the random token itself
-- instead of an email-address match. Existing email-bound
-- invitations keep their original behaviour.
-- =========================================================


-- =========================================================
-- 1. Allow new invitations to have no email restriction.
-- =========================================================

alter table public.group_invites
  alter column email drop not null;

alter table public.group_invites
  drop constraint if exists group_invites_email_not_blank;

alter table public.group_invites
  add constraint group_invites_email_not_blank
  check (
    email is null
    or length(trim(email)) > 0
  );


-- =========================================================
-- 2. Keep the original email-aware creator for compatibility
-- with an already-open older client. The new two-argument
-- overload creates a fresh one-time link and removes the
-- temporary email marker in the same transaction.
-- =========================================================

revoke all
on function public.create_group_invite(uuid, uuid, text)
from public, anon, authenticated;

grant execute
on function public.create_group_invite(uuid, uuid, text)
to authenticated;

create or replace function public.create_group_invite(
  p_group_id uuid,
  p_person_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  -- The existing implementation retains all ownership,
  -- membership, lifecycle and local-contact checks.
  v_token := public.create_group_invite(
    p_group_id,
    p_person_id,
    'one-time-link@invite.invalid'
  );

  update public.group_invites
  set email = null
  where token = v_token
    and status = 'pending'
    and invited_by = (select auth.uid());

  if not found then
    raise exception 'Unable to create one-time invitation';
  end if;

  return v_token;
end;
$$;

revoke all
on function public.create_group_invite(uuid, uuid)
from public, anon;

grant execute
on function public.create_group_invite(uuid, uuid)
to authenticated;


-- =========================================================
-- 3. Preserve the original claim implementation for legacy
-- email-bound links, then put a one-time-token wrapper at
-- the original public RPC name.
--
-- The wrapper locks the invitation before temporarily
-- binding an email-free invite to the first authenticated
-- claimant. The original claim function then performs its
-- existing atomic identity merge. The email is cleared
-- again before the transaction commits.
-- =========================================================

alter function public.claim_group_invite(uuid)
  rename to claim_group_invite_email_bound;

revoke all
on function public.claim_group_invite_email_bound(uuid)
from public, anon, authenticated;

create or replace function public.claim_group_invite(
  p_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_original_email text;
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must sign in before accepting this invitation';
  end if;

  select gi.email
  into v_original_email
  from public.group_invites gi
  where gi.token = p_token
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_original_email is null then
    select lower(trim(u.email))
    into v_user_email
    from auth.users u
    where u.id = v_user_id;

    if v_user_email is null or v_user_email = '' then
      raise exception 'Your account does not have an email address';
    end if;

    -- This value exists only inside the current transaction.
    -- Holding the row lock makes the first successful claim
    -- the only account that can consume the token.
    update public.group_invites
    set email = v_user_email
    where token = p_token;
  end if;

  v_group_id := public.claim_group_invite_email_bound(p_token);

  if v_original_email is null then
    update public.group_invites
    set email = null
    where token = p_token;
  end if;

  return v_group_id;
end;
$$;

revoke all
on function public.claim_group_invite(uuid)
from public, anon;

grant execute
on function public.claim_group_invite(uuid)
to authenticated;


-- =========================================================
-- 4. Public preview: omit email hints for new one-time links.
-- The token reveals only the group/contact labels and invite
-- lifecycle state, matching the previous preview surface.
-- =========================================================

create or replace function public.get_group_invite_preview(
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
    case
      when gi.email is null then null
      when position('@' in gi.email) > 1 then
        left(gi.email, 1)
        || '***@'
        || split_part(gi.email, '@', 2)
      else '***'
    end,
    case
      when gi.status = 'pending'
        and gi.expires_at <= now()
      then 'expired'
      else gi.status::text
    end,
    gi.expires_at
  from public.group_invites gi
  join public.groups g
    on g.id = gi.group_id
  left join public.people local_person
    on local_person.id = gi.person_id
  left join public.people claimed_person
    on claimed_person.id = gi.claimed_person_id
  where gi.token = p_token;
$$;

revoke all
on function public.get_group_invite_preview(uuid)
from public;

grant execute
on function public.get_group_invite_preview(uuid)
to anon, authenticated;
