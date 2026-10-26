-- Feature use is opt-in. Only the trusted server can change grants after
-- checking USAGE_OWNER_USER_ID; users can read only their own access.
create table public.user_feature_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null check (feature_key in ('tax_receipts')),
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

alter table public.user_feature_access enable row level security;
revoke all on public.user_feature_access from public, anon, authenticated;
grant select on public.user_feature_access to authenticated;
grant select, insert, update, delete on public.user_feature_access to service_role;

create policy "Users can read their own feature access"
on public.user_feature_access for select to authenticated
using (user_id = (select auth.uid()));

-- Email lookup needs auth.users, which is deliberately unavailable to normal
-- users and service_role SQL. Keep this privileged implementation unexposed;
-- both entry points are callable only by the server's service_role.
create or replace function private.search_feature_access_users(
  p_query text, p_offset integer, p_limit integer
)
returns table (
  user_id uuid, display_name text, email text, enabled_feature_keys text[]
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, u.email::text,
    coalesce((
      select array_agg(g.feature_key order by g.feature_key)
      from public.user_feature_access g
      where g.user_id = p.id and g.enabled
    ), array[]::text[])
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.deleted_at is null
    and (
      coalesce(trim(p_query), '') = ''
      or strpos(lower(p.display_name), lower(trim(p_query))) > 0
      or strpos(lower(coalesce(u.email, '')), lower(trim(p_query))) > 0
    )
  order by lower(p.display_name), p.id
  limit least(greatest(coalesce(p_limit, 21), 1), 21)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function private.search_feature_access_users(text, integer, integer)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.search_feature_access_users(text, integer, integer)
  to service_role;

create or replace function public.search_feature_access_users(
  p_query text default '', p_offset integer default 0, p_limit integer default 21
)
returns table (
  user_id uuid, display_name text, email text, enabled_feature_keys text[]
)
language sql stable security invoker set search_path = ''
as $$
  select * from private.search_feature_access_users(p_query, p_offset, p_limit);
$$;
revoke all on function public.search_feature_access_users(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_feature_access_users(text, integer, integer)
  to service_role;
