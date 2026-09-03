-- =========================================================
-- PROFILE & ACCOUNT SETTINGS
-- =========================================================
--
-- Adds:
--
-- ✓ account avatar color
-- ✓ optional profile picture
-- ✓ Supabase Storage avatar bucket
-- ✓ secure per-user upload/delete access
-- ✓ canonical people identity synchronization
-- ✓ profile update RPC
--
-- Avatar behavior:
--
-- avatar_path IS NULL
-- → color + initial
--
-- avatar_path IS NOT NULL
-- → uploaded profile picture
-- =========================================================


-- =========================================================
-- 1. PROFILE CUSTOMIZATION
-- =========================================================

alter table public.profiles
add column if not exists
  avatar_color text
  not null
  default 'bg-blue-600';


alter table public.profiles
add column if not exists
  avatar_path text;


-- =========================================================
-- 2. PEOPLE AVATAR
--
-- Canonical people rows mirror the linked account profile.
--
-- Local contacts can continue using avatar_color only.
-- =========================================================

alter table public.people
add column if not exists
  avatar_path text;


alter table public.people
alter column avatar_color
set default 'bg-blue-600';


-- =========================================================
-- 3. PROFILE AVATAR COLOR VALIDATION
--
-- Keep this palette fixed so stored Tailwind classes always
-- correspond to classes compiled into the application.
-- =========================================================

alter table public.profiles
drop constraint if exists
profiles_avatar_color_valid;


alter table public.profiles
add constraint
profiles_avatar_color_valid
check (
  avatar_color in (
    'bg-blue-600',
    'bg-purple-600',
    'bg-pink-600',
    'bg-rose-600',
    'bg-orange-600',
    'bg-emerald-600',
    'bg-cyan-600',
    'bg-indigo-600'
  )
);


-- =========================================================
-- 4. AVATAR PATH MUST BELONG TO USER
--
-- Expected:
--
-- <auth-user-uuid>/<file>
--
-- Example:
--
-- 123e4567.../550e8400....webp
-- =========================================================

alter table public.profiles
drop constraint if exists
profiles_avatar_path_owner;


alter table public.profiles
add constraint
profiles_avatar_path_owner
check (

  avatar_path is null

  or

  split_part(
    avatar_path,
    '/',
    1
  ) = id::text

);


alter table public.people
drop constraint if exists
people_avatar_path_linked_user;


alter table public.people
add constraint
people_avatar_path_linked_user
check (

  avatar_path is null

  or (

    linked_user_id
      is not null

    and

    split_part(
      avatar_path,
      '/',
      1
    ) =
      linked_user_id::text

  )

);


-- =========================================================
-- 5. BACKFILL EXISTING PROFILES
--
-- If the canonical people identity already has an avatar
-- color, preserve it.
-- =========================================================

update public.profiles profile

set avatar_color =
  coalesce(
    person.avatar_color,
    profile.avatar_color,
    'bg-blue-600'
  )

from public.people person

where person.linked_user_id =
  profile.id;


-- =========================================================
-- 6. BACKFILL CANONICAL PEOPLE
-- =========================================================

update public.people person

set avatar_color =
  coalesce(
    person.avatar_color,
    profile.avatar_color,
    'bg-blue-600'
  )

from public.profiles profile

where person.linked_user_id =
  profile.id;


-- =========================================================
-- 7. AVATAR STORAGE BUCKET
--
-- Public READ is intentional:
--
-- avatars are display assets.
--
-- Upload/delete remains restricted by Storage RLS.
--
-- Maximum:
-- 5 MB
--
-- Allowed:
-- JPEG
-- PNG
-- WebP
-- =========================================================

insert into storage.buckets (

  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types

)
values (

  'avatars',
  'avatars',
  true,
  5242880,

  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]

)

on conflict (id)

do update set

  public =
    excluded.public,

  file_size_limit =
    excluded.file_size_limit,

  allowed_mime_types =
    excluded.allowed_mime_types;


-- =========================================================
-- 8. STORAGE INSERT POLICY
--
-- User may upload ONLY inside:
--
-- avatars/<their-auth-id>/...
-- =========================================================

drop policy if exists
"avatar_insert_own_folder"
on storage.objects;


create policy
"avatar_insert_own_folder"

on storage.objects

for insert

to authenticated

with check (

  bucket_id =
    'avatars'

  and

  (
    storage.foldername(
      name
    )
  )[1] =
    (select auth.uid())::text

);


-- =========================================================
-- 9. STORAGE UPDATE POLICY
--
-- Included for future flexibility even though our UI will
-- normally create unique filenames rather than overwrite.
-- =========================================================

drop policy if exists
"avatar_update_own_folder"
on storage.objects;


create policy
"avatar_update_own_folder"

on storage.objects

for update

to authenticated

using (

  bucket_id =
    'avatars'

  and

  (
    storage.foldername(
      name
    )
  )[1] =
    (select auth.uid())::text

)

with check (

  bucket_id =
    'avatars'

  and

  (
    storage.foldername(
      name
    )
  )[1] =
    (select auth.uid())::text

);


-- =========================================================
-- 10. STORAGE DELETE POLICY
--
-- User may only delete their own avatar files.
-- =========================================================

drop policy if exists
"avatar_delete_own_folder"
on storage.objects;


create policy
"avatar_delete_own_folder"

on storage.objects

for delete

to authenticated

using (

  bucket_id =
    'avatars'

  and

  (
    storage.foldername(
      name
    )
  )[1] =
    (select auth.uid())::text

);


-- =========================================================
-- 11. STORAGE SELECT
--
-- Public bucket handles normal public image delivery.
--
-- This policy additionally lets authenticated clients read
-- avatar object metadata when needed.
-- =========================================================

drop policy if exists
"avatar_authenticated_select"
on storage.objects;


create policy
"avatar_authenticated_select"

on storage.objects

for select

to authenticated

using (
  bucket_id =
    'avatars'
);


-- =========================================================
-- 12. UPDATE MY PROFILE RPC
--
-- This is the preferred method for profile edits.
--
-- It updates BOTH:
--
-- profiles
--      ↓
-- canonical people identity
--
-- ensuring names/colors/pictures stay synchronized.
-- =========================================================

create or replace function
public.update_my_profile(

  p_display_name text,

  p_avatar_color text,

  p_avatar_path text
    default null

)
returns void

language plpgsql
security definer
set search_path = ''

as $$
declare

  v_user_id uuid :=
    auth.uid();

  v_display_name text :=
    trim(
      coalesce(
        p_display_name,
        ''
      )
    );

  v_avatar_color text :=
    trim(
      coalesce(
        p_avatar_color,
        ''
      )
    );

begin

  -- -------------------------------------------------------
  -- Authentication
  -- -------------------------------------------------------

  if v_user_id
     is null
  then

    raise exception
      'You must be signed in';

  end if;


  -- -------------------------------------------------------
  -- Display name
  -- -------------------------------------------------------

  if v_display_name = '' then

    raise exception
      'Display name is required';

  end if;


  if length(
       v_display_name
     ) > 80
  then

    raise exception
      'Display name cannot exceed 80 characters';

  end if;


  -- -------------------------------------------------------
  -- Avatar color
  -- -------------------------------------------------------

  if v_avatar_color
     not in (

       'bg-blue-600',
       'bg-purple-600',
       'bg-pink-600',
       'bg-rose-600',
       'bg-orange-600',
       'bg-emerald-600',
       'bg-cyan-600',
       'bg-indigo-600'

     )
  then

    raise exception
      'Invalid avatar color';

  end if;


  -- -------------------------------------------------------
  -- Avatar object ownership
  --
  -- Browser cannot point the account to somebody else's
  -- Storage object.
  -- -------------------------------------------------------

  if p_avatar_path
     is not null

     and

     split_part(
       p_avatar_path,
       '/',
       1
     ) <>
       v_user_id::text
  then

    raise exception
      'Invalid avatar path';

  end if;


  -- -------------------------------------------------------
  -- Profile
  -- -------------------------------------------------------

  update public.profiles

  set

    display_name =
      v_display_name,

    avatar_color =
      v_avatar_color,

    avatar_path =
      p_avatar_path,

    updated_at =
      now()

  where id =
    v_user_id;


  if not found then

    raise exception
      'Profile not found';

  end if;


  -- -------------------------------------------------------
  -- Canonical people identity
  --
  -- Important:
  --
  -- We update by linked_user_id, NOT by name.
  -- -------------------------------------------------------

  update public.people

  set

    name =
      v_display_name,

    avatar_color =
      v_avatar_color,

    avatar_path =
      p_avatar_path,

    updated_at =
      now()

  where linked_user_id =
    v_user_id;


end;
$$;


revoke all
on function
public.update_my_profile(
  text,
  text,
  text
)
from public;


grant execute
on function
public.update_my_profile(
  text,
  text,
  text
)
to authenticated;


-- =========================================================
-- 13. KEEP PROFILE AVATAR CHANGES SYNCHRONIZED
--
-- Defensive sync in case some future code updates profiles
-- directly rather than using update_my_profile().
-- =========================================================

create or replace function
public.sync_profile_avatar_to_person()
returns trigger

language plpgsql
security definer
set search_path = ''

as $$
begin

  update public.people

  set

    avatar_color =
      new.avatar_color,

    avatar_path =
      new.avatar_path,

    updated_at =
      now()

  where linked_user_id =
    new.id;


  return new;

end;
$$;


drop trigger if exists
sync_profile_avatar_to_person
on public.profiles;


create trigger
sync_profile_avatar_to_person

after update of
  avatar_color,
  avatar_path

on public.profiles

for each row

execute function
public.sync_profile_avatar_to_person();


revoke all
on function
public.sync_profile_avatar_to_person()
from public, anon, authenticated;