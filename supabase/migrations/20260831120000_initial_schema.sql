-- SplitMate initial schema + RLS
-- Run this as a Supabase migration.
-- Requires the standard Supabase auth schema.

create schema if not exists private;

do $$ begin
  create type public.split_method as enum ('equal', 'amount', 'items');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.group_member_role as enum ('owner', 'member');
exception when duplicate_object then null;
end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  avatar_color text,
  linked_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role public.group_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (group_id, person_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  expense_date date not null default current_date,
  paid_by uuid not null references public.people(id),
  split_method public.split_method not null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  person_id uuid not null references public.people(id),
  share_amount numeric(12,2) not null check (share_amount >= 0),
  created_at timestamptz not null default now(),
  unique (expense_id, person_id)
);

create table public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  from_person_id uuid not null references public.people(id),
  to_person_id uuid not null references public.people(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_item_participants (
  expense_item_id uuid not null references public.expense_items(id) on delete cascade,
  person_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  primary key (expense_item_id, person_id)
);

create table public.expense_item_addons (
  id uuid primary key default gen_random_uuid(),
  expense_item_id uuid not null references public.expense_items(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ious (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  from_person_id uuid not null references public.people(id),
  to_person_id uuid not null references public.people(id),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  iou_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);

create table public.iou_payments (
  id uuid primary key default gen_random_uuid(),
  iou_id uuid not null references public.ious(id) on delete cascade,
  from_person_id uuid not null references public.people(id),
  to_person_id uuid not null references public.people(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);

-- Indexes for common joins/RLS filters.
create index idx_people_owner_id on public.people(owner_id);
create index idx_people_linked_user_id on public.people(linked_user_id);
create index idx_groups_owner_id on public.groups(owner_id);
create index idx_group_members_person_id on public.group_members(person_id);
create index idx_expenses_owner_id on public.expenses(owner_id);
create index idx_expenses_group_id on public.expenses(group_id);
create index idx_expenses_paid_by on public.expenses(paid_by);
create index idx_expense_participants_expense_id on public.expense_participants(expense_id);
create index idx_expense_participants_person_id on public.expense_participants(person_id);
create index idx_expense_payments_expense_id on public.expense_payments(expense_id);
create index idx_expense_items_expense_id on public.expense_items(expense_id);
create index idx_expense_item_participants_person_id on public.expense_item_participants(person_id);
create index idx_expense_item_addons_item_id on public.expense_item_addons(expense_item_id);
create index idx_ious_owner_id on public.ious(owner_id);
create index idx_ious_group_id on public.ious(group_id);
create index idx_ious_from_person_id on public.ious(from_person_id);
create index idx_ious_to_person_id on public.ious(to_person_id);
create index idx_iou_payments_iou_id on public.iou_payments(iou_id);

-- Keep profiles in sync with Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'User'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- SECURITY DEFINER helpers are kept in a non-exposed schema to avoid
-- recursive RLS checks. search_path is pinned as recommended by Supabase.
create or replace function private.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id = (select auth.uid())
  );
$$;

create or replace function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_group_owner(p_group_id)
  or exists (
    select 1
    from public.group_members gm
    join public.people p on p.id = gm.person_id
    where gm.group_id = p_group_id
      and p.linked_user_id = (select auth.uid())
  );
$$;

create or replace function private.can_view_expense(p_expense_id uuid)
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
        e.owner_id = (select auth.uid())
        or (
          private.is_group_member(e.group_id)
          and exists (
            select 1
            from public.expense_participants ep
            join public.people p on p.id = ep.person_id
            where ep.expense_id = e.id
              and p.linked_user_id = (select auth.uid())
          )
        )
      )
  );
$$;

create or replace function private.can_view_iou(p_iou_id uuid)
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
        i.owner_id = (select auth.uid())
        or (
          private.is_group_member(i.group_id)
          and exists (
            select 1
            from public.people p
            where p.id in (i.from_person_id, i.to_person_id)
              and p.linked_user_id = (select auth.uid())
          )
        )
      )
  );
$$;

revoke all on function private.is_group_owner(uuid) from public;
revoke all on function private.is_group_member(uuid) from public;
revoke all on function private.can_view_expense(uuid) from public;
revoke all on function private.can_view_iou(uuid) from public;

grant usage on schema private to authenticated;
grant execute on function private.is_group_owner(uuid) to authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.can_view_expense(uuid) to authenticated;
grant execute on function private.can_view_iou(uuid) to authenticated;

-- Validation triggers: people used in a transaction must belong to that group.
create or replace function public.validate_expense_group_people()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select e.group_id into v_group_id
  from public.expenses e
  where e.id = new.expense_id;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = v_group_id
      and gm.person_id = new.person_id
  ) then
    raise exception 'Person % is not a member of the expense group', new.person_id;
  end if;

  return new;
end;
$$;

create trigger validate_expense_participant_group
before insert or update on public.expense_participants
for each row execute function public.validate_expense_group_people();

create or replace function public.validate_expense_paid_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = new.group_id
      and gm.person_id = new.paid_by
  ) then
    raise exception 'Payer must be a member of the expense group';
  end if;
  return new;
end;
$$;

create trigger validate_expense_payer_group
before insert or update on public.expenses
for each row execute function public.validate_expense_paid_by();

create or replace function public.validate_iou_group_people()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = new.group_id
      and gm.person_id = new.from_person_id
  ) then
    raise exception 'IOU sender must be a member of the group';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = new.group_id
      and gm.person_id = new.to_person_id
  ) then
    raise exception 'IOU receiver must be a member of the group';
  end if;

  return new;
end;
$$;

create trigger validate_iou_people_group
before insert or update on public.ious
for each row execute function public.validate_iou_group_people();

-- RLS
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.expense_payments enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_item_participants enable row level security;
alter table public.expense_item_addons enable row level security;
alter table public.ious enable row level security;
alter table public.iou_payments enable row level security;

grant select, insert, update, delete on all tables in schema public to authenticated;

create policy profiles_select on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy people_select on public.people
for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.group_members gm
    where gm.person_id = people.id
      and private.is_group_member(gm.group_id)
  )
);

create policy people_insert on public.people
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy people_update on public.people
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy people_delete on public.people
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy groups_select on public.groups
for select to authenticated
using (owner_id = (select auth.uid()) or private.is_group_member(id));

create policy groups_insert on public.groups
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy groups_update on public.groups
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy groups_delete on public.groups
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy group_members_select on public.group_members
for select to authenticated
using (private.is_group_member(group_id));

create policy group_members_insert on public.group_members
for insert to authenticated
with check (private.is_group_owner(group_id));

create policy group_members_update on public.group_members
for update to authenticated
using (private.is_group_owner(group_id))
with check (private.is_group_owner(group_id));

create policy group_members_delete on public.group_members
for delete to authenticated
using (private.is_group_owner(group_id));

create policy expenses_select on public.expenses
for select to authenticated
using ((select private.can_view_expense(id)));

create policy expenses_insert on public.expenses
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private.is_group_owner(group_id)
);

create policy expenses_update on public.expenses
for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and private.is_group_owner(group_id)
);

create policy expenses_delete on public.expenses
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy expense_participants_select on public.expense_participants
for select to authenticated
using ((select private.can_view_expense(expense_id)));

create policy expense_participants_insert on public.expense_participants
for insert to authenticated
with check ((select private.can_view_expense(expense_id)));

create policy expense_participants_update on public.expense_participants
for update to authenticated
using ((select private.can_view_expense(expense_id)))
with check ((select private.can_view_expense(expense_id)));

create policy expense_participants_delete on public.expense_participants
for delete to authenticated
using ((select private.can_view_expense(expense_id)));

create policy expense_payments_select on public.expense_payments
for select to authenticated
using ((select private.can_view_expense(expense_id)));

create policy expense_payments_insert on public.expense_payments
for insert to authenticated
with check ((select private.can_view_expense(expense_id)));

create policy expense_payments_update on public.expense_payments
for update to authenticated
using ((select private.can_view_expense(expense_id)))
with check ((select private.can_view_expense(expense_id)));

create policy expense_payments_delete on public.expense_payments
for delete to authenticated
using ((select private.can_view_expense(expense_id)));

create policy expense_items_select on public.expense_items
for select to authenticated
using ((select private.can_view_expense(expense_id)));

create policy expense_items_insert on public.expense_items
for insert to authenticated
with check ((select private.can_view_expense(expense_id)));

create policy expense_items_update on public.expense_items
for update to authenticated
using ((select private.can_view_expense(expense_id)))
with check ((select private.can_view_expense(expense_id)));

create policy expense_items_delete on public.expense_items
for delete to authenticated
using ((select private.can_view_expense(expense_id)));

create policy expense_item_participants_select on public.expense_item_participants
for select to authenticated
using (
  exists (
    select 1
    from public.expense_items ei
    where ei.id = expense_item_participants.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_participants_insert on public.expense_item_participants
for insert to authenticated
with check (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_participants.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_participants_update on public.expense_item_participants
for update to authenticated
using (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_participants.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
)
with check (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_participants.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_participants_delete on public.expense_item_participants
for delete to authenticated
using (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_participants.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_addons_select on public.expense_item_addons
for select to authenticated
using (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_addons.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_addons_insert on public.expense_item_addons
for insert to authenticated
with check (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_addons.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_addons_update on public.expense_item_addons
for update to authenticated
using (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_addons.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
)
with check (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_addons.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy expense_item_addons_delete on public.expense_item_addons
for delete to authenticated
using (
  exists (
    select 1 from public.expense_items ei
    where ei.id = expense_item_addons.expense_item_id
      and private.can_view_expense(ei.expense_id)
  )
);

create policy ious_select on public.ious
for select to authenticated
using ((select private.can_view_iou(id)));

create policy ious_insert on public.ious
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private.is_group_owner(group_id)
);

create policy ious_update on public.ious
for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and private.is_group_owner(group_id)
);

create policy ious_delete on public.ious
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy iou_payments_select on public.iou_payments
for select to authenticated
using ((select private.can_view_iou(iou_id)));

create policy iou_payments_insert on public.iou_payments
for insert to authenticated
with check ((select private.can_view_iou(iou_id)));

create policy iou_payments_update on public.iou_payments
for update to authenticated
using ((select private.can_view_iou(iou_id)))
with check ((select private.can_view_iou(iou_id)));

create policy iou_payments_delete on public.iou_payments
for delete to authenticated
using ((select private.can_view_iou(iou_id)));
