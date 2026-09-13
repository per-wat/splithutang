-- Recurring shared payments with versioned rules, immutable monthly snapshots,
-- exact period allocations, receiver confirmation, RLS and notifications.

do $$ begin
  create type public.recurring_frequency as enum ('monthly');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.recurring_arrangement_status as enum ('active', 'paused', 'ended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.recurring_period_state as enum ('open', 'skipped');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.recurring_obligation_status as enum ('unpaid', 'pending', 'paid', 'skipped');
exception when duplicate_object then null;
end $$;

create table public.recurring_arrangements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  payer_person_id uuid not null references public.people(id),
  frequency public.recurring_frequency not null default 'monthly',
  start_date date not null,
  end_date date,
  status public.recurring_arrangement_status not null default 'active',
  paused_from date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (status <> 'paused' or paused_from is not null),
  check (status <> 'ended' or end_date is not null)
);

create table public.recurring_arrangement_versions (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.recurring_arrangements(id) on delete cascade,
  effective_from date not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  due_day smallint not null check (due_day between 1 and 31),
  created_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (arrangement_id, effective_from),
  check (effective_from = date_trunc('month', effective_from)::date)
);

create table public.recurring_version_participants (
  version_id uuid not null references public.recurring_arrangement_versions(id) on delete cascade,
  person_id uuid not null references public.people(id),
  share_amount numeric(12,2) not null check (share_amount >= 0),
  created_at timestamptz not null default now(),
  primary key (version_id, person_id)
);

create table public.recurring_periods (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.recurring_arrangements(id) on delete cascade,
  version_id uuid not null references public.recurring_arrangement_versions(id),
  period_start date not null,
  due_date date not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  state public.recurring_period_state not null default 'open',
  skip_reason text,
  created_at timestamptz not null default now(),
  unique (arrangement_id, period_start),
  check (period_start = date_trunc('month', period_start)::date),
  check ((state = 'skipped') or skip_reason is null)
);

create table public.recurring_obligations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.recurring_periods(id) on delete cascade,
  person_id uuid not null references public.people(id),
  payer_person_id uuid not null references public.people(id),
  share_amount numeric(12,2) not null check (share_amount > 0),
  payment_status public.recurring_obligation_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, person_id),
  check (person_id <> payer_person_id)
);

create table public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.recurring_arrangements(id) on delete cascade,
  from_person_id uuid not null references public.people(id),
  to_person_id uuid not null references public.people(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text,
  status public.payment_status not null default 'pending',
  submitted_by_user_id uuid references public.profiles(id),
  resolved_by_user_id uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);

create table public.recurring_payment_allocations (
  payment_id uuid not null references public.recurring_payments(id) on delete cascade,
  obligation_id uuid not null references public.recurring_obligations(id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (payment_id, obligation_id)
);

create index recurring_arrangements_group on public.recurring_arrangements(group_id, status);
create index recurring_arrangements_payer on public.recurring_arrangements(payer_person_id, status);
create index recurring_versions_arrangement_effective on public.recurring_arrangement_versions(arrangement_id, effective_from desc);
create index recurring_version_participants_person on public.recurring_version_participants(person_id, version_id);
create index recurring_periods_arrangement_due on public.recurring_periods(arrangement_id, due_date);
create index recurring_obligations_person_status on public.recurring_obligations(person_id, payment_status, period_id);
create index recurring_obligations_payer_status on public.recurring_obligations(payer_person_id, payment_status, period_id);
create index recurring_payments_arrangement_paid on public.recurring_payments(arrangement_id, paid_at desc);
create index recurring_payments_pending_receiver on public.recurring_payments(to_person_id, paid_at desc) where status = 'pending';
create index recurring_payment_allocations_obligation on public.recurring_payment_allocations(obligation_id);

drop trigger if exists set_recurring_arrangements_updated_at on public.recurring_arrangements;
create trigger set_recurring_arrangements_updated_at
before update on public.recurring_arrangements
for each row execute function public.set_updated_at();

drop trigger if exists set_recurring_obligations_updated_at on public.recurring_obligations;
create trigger set_recurring_obligations_updated_at
before update on public.recurring_obligations
for each row execute function public.set_updated_at();

create or replace function private.can_view_recurring(p_arrangement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recurring_arrangements ra
    where ra.id = p_arrangement_id
      and (
        ra.owner_id = (select auth.uid())
        or private.is_group_owner(ra.group_id)
        or (
          private.is_group_member(ra.group_id)
          and (
            ra.payer_person_id = private.current_person_id()
            or exists (
              select 1
              from public.recurring_arrangement_versions rav
              join public.recurring_version_participants rvp on rvp.version_id = rav.id
              where rav.arrangement_id = ra.id
                and rvp.person_id = private.current_person_id()
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_view_recurring(uuid) from public, anon, authenticated;
grant execute on function private.can_view_recurring(uuid) to authenticated;

alter table public.recurring_arrangements enable row level security;
alter table public.recurring_arrangement_versions enable row level security;
alter table public.recurring_version_participants enable row level security;
alter table public.recurring_periods enable row level security;
alter table public.recurring_obligations enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.recurring_payment_allocations enable row level security;

revoke all on public.recurring_arrangements, public.recurring_arrangement_versions,
  public.recurring_version_participants, public.recurring_periods,
  public.recurring_obligations, public.recurring_payments,
  public.recurring_payment_allocations from anon, authenticated;

grant select on public.recurring_arrangements, public.recurring_arrangement_versions,
  public.recurring_version_participants, public.recurring_periods,
  public.recurring_obligations, public.recurring_payments,
  public.recurring_payment_allocations to authenticated;

create policy recurring_arrangements_select on public.recurring_arrangements
  for select to authenticated using (private.can_view_recurring(id));
create policy recurring_versions_select on public.recurring_arrangement_versions
  for select to authenticated using (private.can_view_recurring(arrangement_id));
create policy recurring_version_participants_select on public.recurring_version_participants
  for select to authenticated using (exists (
    select 1 from public.recurring_arrangement_versions rav
    where rav.id = version_id and private.can_view_recurring(rav.arrangement_id)
  ));
create policy recurring_periods_select on public.recurring_periods
  for select to authenticated using (private.can_view_recurring(arrangement_id));
create policy recurring_obligations_select on public.recurring_obligations
  for select to authenticated using (exists (
    select 1 from public.recurring_periods rp
    where rp.id = period_id and private.can_view_recurring(rp.arrangement_id)
  ));
create policy recurring_payments_select on public.recurring_payments
  for select to authenticated using (private.can_view_recurring(arrangement_id));
create policy recurring_allocations_select on public.recurring_payment_allocations
  for select to authenticated using (exists (
    select 1
    from public.recurring_obligations ro
    join public.recurring_periods rp on rp.id = ro.period_id
    where ro.id = obligation_id and private.can_view_recurring(rp.arrangement_id)
  ));

-- Build immutable period and obligation snapshots from the version effective
-- for each month. Existing periods are never rewritten by this function.
create or replace function private.generate_recurring_periods(
  p_arrangement_id uuid,
  p_from date,
  p_to date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_arrangement public.recurring_arrangements%rowtype;
  v_month date;
  v_version public.recurring_arrangement_versions%rowtype;
  v_period_id uuid;
  v_due_date date;
begin
  select * into v_arrangement
  from public.recurring_arrangements
  where id = p_arrangement_id;

  if v_arrangement.id is null then return; end if;

  for v_month in
    select generate_series(
      date_trunc('month', greatest(p_from, v_arrangement.start_date))::date,
      date_trunc('month', least(
        p_to,
        coalesce(v_arrangement.end_date, p_to),
        coalesce(v_arrangement.paused_from - 1, p_to)
      ))::date,
      interval '1 month'
    )::date
  loop
    select rav.* into v_version
    from public.recurring_arrangement_versions rav
    where rav.arrangement_id = p_arrangement_id
      and rav.effective_from <= v_month
    order by rav.effective_from desc
    limit 1;

    if v_version.id is null then continue; end if;

    v_due_date := greatest(
      v_arrangement.start_date,
      make_date(
        extract(year from v_month)::integer,
        extract(month from v_month)::integer,
        least(
          v_version.due_day::integer,
          extract(day from (v_month + interval '1 month' - interval '1 day'))::integer
        )
      )
    );
    if v_arrangement.end_date is not null then
      v_due_date := least(v_due_date, v_arrangement.end_date);
    end if;

    insert into public.recurring_periods (
      arrangement_id, version_id, period_start, due_date, total_amount
    ) values (
      p_arrangement_id, v_version.id, v_month, v_due_date, v_version.total_amount
    )
    on conflict (arrangement_id, period_start) do nothing
    returning id into v_period_id;

    if v_period_id is not null then
      insert into public.recurring_obligations (
        period_id, person_id, payer_person_id, share_amount
      )
      select v_period_id, rvp.person_id, v_arrangement.payer_person_id, rvp.share_amount
      from public.recurring_version_participants rvp
      where rvp.version_id = v_version.id
        and rvp.person_id <> v_arrangement.payer_person_id
        and rvp.share_amount > 0;
    end if;
  end loop;
end;
$$;

revoke all on function private.generate_recurring_periods(uuid, date, date) from public, anon, authenticated;

create or replace function private.recurring_timeline_status(
  p_period_id uuid,
  p_viewer_person_id uuid,
  p_payer_person_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period public.recurring_periods%rowtype;
  v_obligation public.recurring_obligations%rowtype;
begin
  select * into v_period from public.recurring_periods where id = p_period_id;
  if v_period.id is null then return 'not_applicable'; end if;
  if v_period.state = 'skipped' then return 'skipped'; end if;

  if p_viewer_person_id is distinct from p_payer_person_id then
    select * into v_obligation
    from public.recurring_obligations
    where period_id = p_period_id and person_id = p_viewer_person_id;

    if v_obligation.id is null then return 'group'; end if;
    if v_obligation.payment_status = 'pending' then return 'pending'; end if;
    if v_obligation.payment_status = 'paid' then
      if exists (
        select 1
        from public.recurring_payment_allocations rpa
        join public.recurring_payments rpay on rpay.id = rpa.payment_id
        where rpa.obligation_id = v_obligation.id
          and rpay.status = 'confirmed'
          and rpay.paid_at::date < v_period.due_date
      ) then return 'paid_advance'; end if;
      return 'paid';
    end if;
    return case when v_period.due_date <= current_date then 'due' else 'upcoming' end;
  end if;

  if not exists (select 1 from public.recurring_obligations where period_id = p_period_id) then
    return 'paid';
  end if;
  if exists (
    select 1 from public.recurring_obligations
    where period_id = p_period_id and payment_status = 'unpaid'
  ) then
    return case when v_period.due_date <= current_date then 'due' else 'upcoming' end;
  end if;
  if exists (
    select 1 from public.recurring_obligations
    where period_id = p_period_id and payment_status = 'pending'
  ) then return 'pending'; end if;
  if exists (
    select 1
    from public.recurring_obligations ro
    join public.recurring_payment_allocations rpa on rpa.obligation_id = ro.id
    join public.recurring_payments rpay on rpay.id = rpa.payment_id
    where ro.period_id = p_period_id
      and rpay.status = 'confirmed'
      and rpay.paid_at::date < v_period.due_date
  ) then return 'paid_advance'; end if;
  return 'paid';
end;
$$;

revoke all on function private.recurring_timeline_status(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.create_recurring_arrangement(
  p_group_id uuid,
  p_name text,
  p_payer_person_id uuid,
  p_total_amount numeric,
  p_participants jsonb,
  p_frequency public.recurring_frequency,
  p_start_date date,
  p_end_date date,
  p_due_day integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_owner_id uuid;
  v_self_person_id uuid;
  v_arrangement_id uuid;
  v_version_id uuid;
  v_item jsonb;
  v_person_id uuid;
  v_share numeric;
  v_seen uuid[] := array[]::uuid[];
  v_sum_cents bigint := 0;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if p_frequency is distinct from 'monthly' then raise exception 'Only monthly recurring payments are supported'; end if;
  if p_total_amount is null or p_total_amount <= 0 then raise exception 'Total amount must be greater than zero'; end if;
  if p_start_date is null then raise exception 'Start date is required'; end if;
  if p_end_date is not null and p_end_date < p_start_date then raise exception 'End date cannot be before start date'; end if;
  if p_due_day is null or p_due_day not between 1 and 31 then raise exception 'Due day must be between 1 and 31'; end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0 then
    raise exception 'At least one participant is required';
  end if;

  select g.owner_id into v_group_owner_id
  from public.groups g where g.id = p_group_id and g.archived_at is null;
  if v_group_owner_id is null then raise exception 'Active group not found'; end if;

  select private.current_person_id() into v_self_person_id;
  if v_group_owner_id <> v_user_id and not private.is_group_member(p_group_id) then
    raise exception 'You are not an active member of this group';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.person_id = p_payer_person_id
      and gm.membership_status = 'active'
  ) then raise exception 'Payer must be an active group member'; end if;

  for v_item in select value from jsonb_array_elements(p_participants)
  loop
    begin
      v_person_id := (v_item ->> 'person_id')::uuid;
      v_share := (v_item ->> 'share_amount')::numeric;
    exception when others then raise exception 'Invalid participant'; end;
    if v_person_id = any(v_seen) then raise exception 'Duplicate participant'; end if;
    if v_share < 0 then raise exception 'Participant share cannot be negative'; end if;
    if not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id and gm.person_id = v_person_id
        and gm.membership_status = 'active'
    ) then raise exception 'Every participant must be an active group member'; end if;
    v_seen := array_append(v_seen, v_person_id);
    v_sum_cents := v_sum_cents + round(v_share * 100)::bigint;
  end loop;

  if not p_payer_person_id = any(v_seen) then raise exception 'Payer must be included as a participant'; end if;
  if v_sum_cents <> round(p_total_amount * 100)::bigint then
    raise exception 'Participant shares must equal the total amount';
  end if;
  if v_group_owner_id <> v_user_id
     and p_payer_person_id <> v_self_person_id
     and not v_self_person_id = any(v_seen) then
    raise exception 'You can only create a recurring payment that involves you';
  end if;

  insert into public.recurring_arrangements (
    owner_id, group_id, name, payer_person_id, frequency, start_date, end_date
  ) values (
    v_user_id, p_group_id, trim(p_name), p_payer_person_id, p_frequency, p_start_date, p_end_date
  ) returning id into v_arrangement_id;

  insert into public.recurring_arrangement_versions (
    arrangement_id, effective_from, total_amount, due_day, created_by_user_id
  ) values (
    v_arrangement_id, date_trunc('month', p_start_date)::date,
    round(p_total_amount, 2), p_due_day, v_user_id
  ) returning id into v_version_id;

  insert into public.recurring_version_participants (version_id, person_id, share_amount)
  select v_version_id, (value ->> 'person_id')::uuid,
    round((value ->> 'share_amount')::numeric, 2)
  from jsonb_array_elements(p_participants);

  perform private.generate_recurring_periods(
    v_arrangement_id,
    date_trunc('month', p_start_date)::date,
    (date_trunc('year', current_date) + interval '2 years' - interval '1 day')::date
  );

  return v_arrangement_id;
end;
$$;

revoke all on function public.create_recurring_arrangement(uuid, text, uuid, numeric, jsonb, public.recurring_frequency, date, date, integer) from public, anon;
grant execute on function public.create_recurring_arrangement(uuid, text, uuid, numeric, jsonb, public.recurring_frequency, date, date, integer) to authenticated;

create or replace function public.update_recurring_arrangement(
  p_arrangement_id uuid,
  p_name text,
  p_total_amount numeric,
  p_participants jsonb,
  p_due_day integer,
  p_effective_from date,
  p_end_date date,
  p_status public.recurring_arrangement_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_arrangement public.recurring_arrangements%rowtype;
  v_version_id uuid;
  v_item jsonb;
  v_person_id uuid;
  v_share numeric;
  v_seen uuid[] := array[]::uuid[];
  v_sum_cents bigint := 0;
  v_last_effective date;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  select * into v_arrangement from public.recurring_arrangements
  where id = p_arrangement_id for update;
  if v_arrangement.id is null then raise exception 'Recurring payment not found'; end if;
  if v_arrangement.owner_id <> v_user_id and not private.is_group_owner(v_arrangement.group_id) then
    raise exception 'Only the creator or group owner can edit this recurring payment';
  end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if p_total_amount is null or p_total_amount <= 0 then raise exception 'Total amount must be greater than zero'; end if;
  if p_due_day is null or p_due_day not between 1 and 31 then raise exception 'Due day must be between 1 and 31'; end if;
  if p_effective_from is null or p_effective_from <> date_trunc('month', p_effective_from)::date then
    raise exception 'Changes must take effect from the first day of a month';
  end if;
  if p_effective_from < date_trunc('month', current_date)::date then
    raise exception 'Historical periods cannot be changed';
  end if;
  if p_end_date is not null and p_end_date < v_arrangement.start_date then raise exception 'End date cannot be before start date'; end if;
  if p_status = 'ended' and p_end_date is null then raise exception 'An ended recurring payment requires an end date'; end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0 then
    raise exception 'At least one participant is required';
  end if;

  select max(effective_from) into v_last_effective
  from public.recurring_arrangement_versions where arrangement_id = p_arrangement_id;
  if p_effective_from <= v_last_effective then
    raise exception 'Choose a month after the latest existing change';
  end if;

  for v_item in select value from jsonb_array_elements(p_participants)
  loop
    begin
      v_person_id := (v_item ->> 'person_id')::uuid;
      v_share := (v_item ->> 'share_amount')::numeric;
    exception when others then raise exception 'Invalid participant'; end;
    if v_person_id = any(v_seen) then raise exception 'Duplicate participant'; end if;
    if v_share < 0 then raise exception 'Participant share cannot be negative'; end if;
    if not exists (
      select 1 from public.group_members gm
      where gm.group_id = v_arrangement.group_id and gm.person_id = v_person_id
        and gm.membership_status = 'active'
    ) then raise exception 'Every participant must be an active group member'; end if;
    v_seen := array_append(v_seen, v_person_id);
    v_sum_cents := v_sum_cents + round(v_share * 100)::bigint;
  end loop;
  if not v_arrangement.payer_person_id = any(v_seen) then raise exception 'Payer must remain a participant'; end if;
  if v_sum_cents <> round(p_total_amount * 100)::bigint then
    raise exception 'Participant shares must equal the total amount';
  end if;

  if exists (
    select 1
    from public.recurring_periods rp
    join public.recurring_obligations ro on ro.period_id = rp.id
    where rp.arrangement_id = p_arrangement_id
      and rp.period_start >= p_effective_from
      and ro.payment_status in ('pending', 'paid')
  ) then raise exception 'Future periods with recorded payments cannot be changed'; end if;

  delete from public.recurring_periods
  where arrangement_id = p_arrangement_id and period_start >= p_effective_from;

  update public.recurring_arrangements set
    name = trim(p_name),
    end_date = p_end_date,
    status = p_status,
    paused_from = case when p_status = 'paused' then p_effective_from else null end
  where id = p_arrangement_id;

  insert into public.recurring_arrangement_versions (
    arrangement_id, effective_from, total_amount, due_day, created_by_user_id
  ) values (
    p_arrangement_id, p_effective_from, round(p_total_amount, 2), p_due_day, v_user_id
  ) returning id into v_version_id;

  insert into public.recurring_version_participants (version_id, person_id, share_amount)
  select v_version_id, (value ->> 'person_id')::uuid,
    round((value ->> 'share_amount')::numeric, 2)
  from jsonb_array_elements(p_participants);

  if p_status = 'active' then
    perform private.generate_recurring_periods(
      p_arrangement_id, p_effective_from,
      (date_trunc('year', p_effective_from) + interval '2 years' - interval '1 day')::date
    );
  end if;
end;
$$;

revoke all on function public.update_recurring_arrangement(uuid, text, numeric, jsonb, integer, date, date, public.recurring_arrangement_status) from public, anon;
grant execute on function public.update_recurring_arrangement(uuid, text, numeric, jsonb, integer, date, date, public.recurring_arrangement_status) to authenticated;

create or replace function public.record_recurring_payment(
  p_arrangement_id uuid,
  p_from_person_id uuid,
  p_period_ids uuid[],
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_payer_person_id uuid;
  v_self_person_id uuid;
  v_allow_self_confirm boolean;
  v_count integer;
  v_amount numeric;
  v_status public.payment_status;
  v_payment_id uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if p_period_ids is null or cardinality(p_period_ids) = 0 or cardinality(p_period_ids) > 24 then
    raise exception 'Choose between 1 and 24 monthly periods';
  end if;
  if cardinality(p_period_ids) <> (
    select count(distinct selected.period_id)
    from unnest(p_period_ids) as selected(period_id)
  ) then
    raise exception 'Duplicate periods are not allowed';
  end if;

  select ra.group_id, ra.payer_person_id, g.allow_debtor_self_confirm
  into v_group_id, v_payer_person_id, v_allow_self_confirm
  from public.recurring_arrangements ra
  join public.groups g on g.id = ra.group_id
  where ra.id = p_arrangement_id
  for update of ra;
  if v_group_id is null then raise exception 'Recurring payment not found'; end if;

  select private.current_person_id() into v_self_person_id;
  if not private.is_group_member(v_group_id) then raise exception 'You are not an active group member'; end if;
  if v_self_person_id <> p_from_person_id and v_self_person_id <> v_payer_person_id then
    raise exception 'Only the participant or payer can record this payment';
  end if;
  if p_from_person_id = v_payer_person_id then raise exception 'The payer does not owe themselves'; end if;

  perform 1
  from public.recurring_obligations ro
  join public.recurring_periods rp on rp.id = ro.period_id
  where rp.arrangement_id = p_arrangement_id
    and rp.id = any(p_period_ids)
  for update of ro;

  select count(*), coalesce(sum(ro.share_amount), 0)
  into v_count, v_amount
  from public.recurring_obligations ro
  join public.recurring_periods rp on rp.id = ro.period_id
  where rp.arrangement_id = p_arrangement_id
    and rp.id = any(p_period_ids)
    and rp.state = 'open'
    and ro.person_id = p_from_person_id
    and ro.payer_person_id = v_payer_person_id
    and ro.payment_status = 'unpaid';

  if v_count <> cardinality(p_period_ids) then
    raise exception 'One or more selected periods are unavailable or already paid';
  end if;

  v_status := case
    when v_self_person_id = v_payer_person_id or v_allow_self_confirm then 'confirmed'::public.payment_status
    else 'pending'::public.payment_status
  end;

  insert into public.recurring_payments (
    arrangement_id, from_person_id, to_person_id, amount, note, status,
    submitted_by_user_id, resolved_by_user_id, resolved_at
  ) values (
    p_arrangement_id, p_from_person_id, v_payer_person_id, v_amount,
    nullif(trim(coalesce(p_note, '')), ''), v_status, v_user_id,
    case when v_status = 'confirmed' then v_user_id else null end,
    case when v_status = 'confirmed' then now() else null end
  ) returning id into v_payment_id;

  insert into public.recurring_payment_allocations (payment_id, obligation_id, amount)
  select v_payment_id, ro.id, ro.share_amount
  from public.recurring_obligations ro
  join public.recurring_periods rp on rp.id = ro.period_id
  where rp.arrangement_id = p_arrangement_id
    and rp.id = any(p_period_ids)
    and ro.person_id = p_from_person_id;

  update public.recurring_obligations ro set
    payment_status = case when v_status = 'confirmed' then 'paid' else 'pending' end
  from public.recurring_periods rp
  where rp.id = ro.period_id
    and rp.arrangement_id = p_arrangement_id
    and rp.id = any(p_period_ids)
    and ro.person_id = p_from_person_id;

  return v_payment_id;
end;
$$;

revoke all on function public.record_recurring_payment(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.record_recurring_payment(uuid, uuid, uuid[], text) to authenticated;

create or replace function public.review_recurring_payment(p_payment_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.recurring_payments%rowtype;
  v_group_id uuid;
  v_self_person_id uuid;
  v_decision text := lower(trim(coalesce(p_decision, '')));
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if v_decision not in ('confirmed', 'rejected') then raise exception 'Decision must be confirmed or rejected'; end if;

  select rpay.* into v_payment
  from public.recurring_payments rpay
  where rpay.id = p_payment_id
  for update;
  if v_payment.id is null then raise exception 'Payment not found'; end if;
  select ra.group_id into v_group_id
  from public.recurring_arrangements ra
  where ra.id = v_payment.arrangement_id;
  if v_payment.status <> 'pending' then raise exception 'Only pending payments can be reviewed'; end if;

  select private.current_person_id() into v_self_person_id;
  if not private.is_group_member(v_group_id) or v_self_person_id <> v_payment.to_person_id then
    raise exception 'Only the payment receiver can review this payment';
  end if;

  update public.recurring_payments set
    status = v_decision::public.payment_status,
    resolved_by_user_id = v_user_id,
    resolved_at = now()
  where id = p_payment_id;

  update public.recurring_obligations ro set
    payment_status = case when v_decision = 'confirmed' then 'paid' else 'unpaid' end
  from public.recurring_payment_allocations rpa
  where rpa.payment_id = p_payment_id and rpa.obligation_id = ro.id;

end;
$$;

revoke all on function public.review_recurring_payment(uuid, text) from public, anon;
grant execute on function public.review_recurring_payment(uuid, text) to authenticated;

create or replace function public.set_recurring_period_skipped(
  p_period_id uuid,
  p_skipped boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_arrangement public.recurring_arrangements%rowtype;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  select ra.* into v_arrangement
  from public.recurring_periods rp
  join public.recurring_arrangements ra on ra.id = rp.arrangement_id
  where rp.id = p_period_id for update of rp;
  if v_arrangement.id is null then raise exception 'Recurring period not found'; end if;
  if v_arrangement.owner_id <> v_user_id
     and not private.is_group_owner(v_arrangement.group_id)
     and private.current_person_id() <> v_arrangement.payer_person_id then
    raise exception 'Only the payer or owner can skip a period';
  end if;
  if exists (
    select 1 from public.recurring_obligations
    where period_id = p_period_id and payment_status in ('pending', 'paid')
  ) then raise exception 'A period with recorded payments cannot be skipped'; end if;

  update public.recurring_periods set
    state = case when p_skipped then 'skipped' else 'open' end,
    skip_reason = case when p_skipped then nullif(trim(coalesce(p_reason, '')), '') else null end
  where id = p_period_id;
  update public.recurring_obligations set
    payment_status = case when p_skipped then 'skipped' else 'unpaid' end
  where period_id = p_period_id;
end;
$$;

revoke all on function public.set_recurring_period_skipped(uuid, boolean, text) from public, anon;
grant execute on function public.set_recurring_period_skipped(uuid, boolean, text) to authenticated;

create or replace function public.get_recurring_overview(p_year integer default extract(year from current_date)::integer)
returns table (
  recurring_id uuid,
  name text,
  group_name text,
  payer_name text,
  payer_person_id uuid,
  frequency text,
  arrangement_status text,
  start_date date,
  end_date date,
  total_amount numeric,
  user_share numeric,
  user_receives numeric,
  next_due_date date,
  timeline jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date;
  v_to date;
  v_id uuid;
  v_self_person_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if p_year not between 2000 and 2200 then raise exception 'Invalid year'; end if;
  v_from := make_date(p_year, 1, 1);
  v_to := make_date(p_year, 12, 31);
  select private.current_person_id() into v_self_person_id;

  for v_id in
    select ra.id from public.recurring_arrangements ra
    where private.can_view_recurring(ra.id)
  loop
    perform private.generate_recurring_periods(v_id, v_from, v_to);
  end loop;

  return query
  select
    ra.id,
    ra.name,
    g.name,
    case when payer.linked_user_id = auth.uid() then 'You' else payer.name end,
    ra.payer_person_id,
    ra.frequency::text,
    ra.status::text,
    ra.start_date,
    ra.end_date,
    coalesce(current_version.total_amount, first_version.total_amount),
    coalesce(current_share.share_amount, 0),
    case when ra.payer_person_id = v_self_person_id then coalesce(receivable.amount, 0) else 0 end,
    next_due.due_date,
    (
      select jsonb_agg(jsonb_build_object(
        'month', extract(month from months.month_start)::integer,
        'period_id', rp.id,
        'due_date', rp.due_date,
        'status', case when rp.id is null then 'not_applicable'
          else private.recurring_timeline_status(rp.id, v_self_person_id, ra.payer_person_id) end
      ) order by months.month_start)
      from generate_series(v_from, v_to, interval '1 month') months(month_start)
      left join public.recurring_periods rp
        on rp.arrangement_id = ra.id and rp.period_start = months.month_start::date
    )
  from public.recurring_arrangements ra
  join public.groups g on g.id = ra.group_id
  join public.people payer on payer.id = ra.payer_person_id
  left join lateral (
    select rav.* from public.recurring_arrangement_versions rav
    where rav.arrangement_id = ra.id and rav.effective_from <= current_date
    order by rav.effective_from desc limit 1
  ) current_version on true
  left join lateral (
    select rav.* from public.recurring_arrangement_versions rav
    where rav.arrangement_id = ra.id order by rav.effective_from limit 1
  ) first_version on true
  left join public.recurring_version_participants current_share
    on current_share.version_id = coalesce(current_version.id, first_version.id)
   and current_share.person_id = v_self_person_id
  left join lateral (
    select sum(rvp.share_amount) amount
    from public.recurring_version_participants rvp
    where rvp.version_id = coalesce(current_version.id, first_version.id)
      and rvp.person_id <> ra.payer_person_id
  ) receivable on true
  left join lateral (
    select min(rp.due_date) due_date
    from public.recurring_periods rp
    left join public.recurring_obligations ro
      on ro.period_id = rp.id and ro.person_id = v_self_person_id
    where rp.arrangement_id = ra.id and rp.state = 'open'
      and rp.due_date >= v_from
      and (
        (v_self_person_id = ra.payer_person_id and exists (
          select 1 from public.recurring_obligations x
          where x.period_id = rp.id and x.payment_status in ('unpaid', 'pending')
        ))
        or (v_self_person_id <> ra.payer_person_id and ro.payment_status in ('unpaid', 'pending'))
      )
  ) next_due on true
  where private.can_view_recurring(ra.id)
  order by (ra.status = 'active') desc, next_due.due_date nulls last, ra.name;
end;
$$;

revoke all on function public.get_recurring_overview(integer) from public, anon;
grant execute on function public.get_recurring_overview(integer) to authenticated;

create or replace function public.get_recurring_detail(p_arrangement_id uuid, p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date;
  v_to date;
  v_self_person_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not private.can_view_recurring(p_arrangement_id) then return null; end if;
  if p_year not between 2000 and 2200 then raise exception 'Invalid year'; end if;
  v_from := make_date(p_year, 1, 1);
  v_to := make_date(p_year, 12, 31);
  select private.current_person_id() into v_self_person_id;
  perform private.generate_recurring_periods(p_arrangement_id, v_from, v_to);

  select jsonb_build_object(
    'id', ra.id,
    'name', ra.name,
    'group_id', ra.group_id,
    'group_name', g.name,
    'payer_person_id', ra.payer_person_id,
    'payer_name', case when payer.linked_user_id = auth.uid() then 'You' else payer.name end,
    'frequency', ra.frequency,
    'status', ra.status,
    'start_date', ra.start_date,
    'end_date', ra.end_date,
    'can_edit', ra.owner_id = auth.uid() or private.is_group_owner(ra.group_id),
    'is_payer', ra.payer_person_id = v_self_person_id,
    'allow_debtor_self_confirm', g.allow_debtor_self_confirm,
    'current_version', (
      select jsonb_build_object(
        'id', rav.id,
        'effective_from', rav.effective_from,
        'total_amount', rav.total_amount,
        'due_day', rav.due_day,
        'participants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'person_id', p.id,
            'name', case when p.linked_user_id = auth.uid() then 'You' else p.name end,
            'share_amount', rvp.share_amount,
            'is_payer', p.id = ra.payer_person_id,
            'avatar_color', p.avatar_color,
            'avatar_path', p.avatar_path
          ) order by (p.id = ra.payer_person_id) desc, p.name), '[]'::jsonb)
          from public.recurring_version_participants rvp
          join public.people p on p.id = rvp.person_id
          where rvp.version_id = rav.id
        )
      )
      from public.recurring_arrangement_versions rav
      where rav.arrangement_id = ra.id and rav.effective_from <= greatest(current_date, ra.start_date)
      order by rav.effective_from desc limit 1
    ),
    'periods', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rp.id,
        'period_start', rp.period_start,
        'due_date', rp.due_date,
        'total_amount', rp.total_amount,
        'state', rp.state,
        'skip_reason', rp.skip_reason,
        'viewer_status', private.recurring_timeline_status(rp.id, v_self_person_id, ra.payer_person_id),
        'obligations', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', ro.id,
            'person_id', ro.person_id,
            'name', case when person.linked_user_id = auth.uid() then 'You' else person.name end,
            'share_amount', ro.share_amount,
            'payment_status', ro.payment_status,
            'payment_id', payment_record.id,
            'payment_status_record', payment_record.status,
            'paid_at', payment_record.paid_at
          ) order by person.name), '[]'::jsonb)
          from public.recurring_obligations ro
          join public.people person on person.id = ro.person_id
          left join lateral (
            select rpay.id, rpay.status, rpay.paid_at
            from public.recurring_payment_allocations rpa
            join public.recurring_payments rpay on rpay.id = rpa.payment_id
            where rpa.obligation_id = ro.id
            order by rpay.created_at desc
            limit 1
          ) payment_record on true
          where ro.period_id = rp.id
        )
      ) order by rp.period_start), '[]'::jsonb)
      from public.recurring_periods rp
      where rp.arrangement_id = ra.id and rp.period_start between v_from and v_to
    )
  ) into v_result
  from public.recurring_arrangements ra
  join public.groups g on g.id = ra.group_id
  join public.people payer on payer.id = ra.payer_person_id
  where ra.id = p_arrangement_id;

  return v_result;
end;
$$;

revoke all on function public.get_recurring_detail(uuid, integer) from public, anon;
grant execute on function public.get_recurring_detail(uuid, integer) to authenticated;

create or replace function public.get_recurring_home_summary(p_limit integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self_person_id uuid;
  v_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select private.current_person_id() into v_self_person_id;
  for v_id in
    select ra.id from public.recurring_arrangements ra
    where ra.status = 'active' and private.can_view_recurring(ra.id)
  loop
    perform private.generate_recurring_periods(
      v_id, date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months' - interval '1 day')::date
    );
  end loop;

  select coalesce(jsonb_agg(row_data order by sort_due) filter (where row_data is not null), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', ra.id,
      'name', ra.name,
      'group_name', g.name,
      'due_date', rp.due_date,
      'amount', case when v_self_person_id = ra.payer_person_id then
        coalesce((select sum(ro.share_amount) from public.recurring_obligations ro where ro.period_id = rp.id), 0)
        else coalesce(ro.share_amount, 0) end,
      'role', case when v_self_person_id = ra.payer_person_id then 'receive' else 'pay' end,
      'status', private.recurring_timeline_status(rp.id, v_self_person_id, ra.payer_person_id)
    ) row_data,
    rp.due_date sort_due
    from public.recurring_arrangements ra
    join public.groups g on g.id = ra.group_id
    join lateral (
      select x.* from public.recurring_periods x
      where x.arrangement_id = ra.id and x.state = 'open'
        and x.period_start >= date_trunc('month', current_date)::date
        and (
          (v_self_person_id = ra.payer_person_id and exists (
            select 1 from public.recurring_obligations target
            where target.period_id = x.id and target.payment_status in ('unpaid', 'pending')
          ))
          or
          (v_self_person_id <> ra.payer_person_id and exists (
            select 1 from public.recurring_obligations target
            where target.period_id = x.id and target.person_id = v_self_person_id
              and target.payment_status in ('unpaid', 'pending')
          ))
        )
      order by x.period_start limit 1
    ) rp on true
    left join public.recurring_obligations ro
      on ro.period_id = rp.id and ro.person_id = v_self_person_id
    where ra.status = 'active' and private.can_view_recurring(ra.id)
      and (v_self_person_id = ra.payer_person_id or ro.id is not null)
    order by rp.due_date
    limit least(greatest(p_limit, 1), 10)
  ) summary;
  return v_result;
end;
$$;

revoke all on function public.get_recurring_home_summary(integer) from public, anon;
grant execute on function public.get_recurring_home_summary(integer) to authenticated;

-- Extend the existing notification domain without changing delivery plumbing.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type in (
  'expense_created', 'expense_updated', 'expense_deleted',
  'expense_payment_submitted', 'expense_payment_recorded', 'expense_payment_confirmed',
  'expense_payment_rejected', 'expense_settled',
  'iou_created', 'iou_updated', 'iou_deleted',
  'iou_payment_submitted', 'iou_payment_recorded', 'iou_payment_confirmed',
  'iou_payment_rejected', 'iou_settled',
  'group_member_invited', 'group_member_added', 'group_member_joined', 'group_member_left',
  'recurring_created', 'recurring_updated', 'recurring_payment_submitted',
  'recurring_payment_recorded', 'recurring_payment_confirmed', 'recurring_payment_rejected'
));

alter table public.notifications drop constraint if exists notifications_resource_type_check;
alter table public.notifications add constraint notifications_resource_type_check
  check (resource_type in ('expense', 'iou', 'group', 'person', 'group_invite', 'recurring'));

create or replace function private.notify_recurring_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_group_id uuid;
  v_group_name text;
  v_name text;
  v_actor_name text;
  v_recipient_user_id uuid;
  v_type text;
  v_title text;
  v_body text;
begin
  if v_actor_user_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  select ra.group_id, g.name, ra.name, coalesce(p.display_name, 'Someone')
  into v_group_id, v_group_name, v_name, v_actor_name
  from public.recurring_arrangements ra
  join public.groups g on g.id = ra.group_id
  left join public.profiles p on p.id = v_actor_user_id
  where ra.id = new.arrangement_id;

  if new.status = 'pending' then
    v_type := 'recurring_payment_submitted';
    v_title := format('%s marked RM %s as paid.', v_actor_name, to_char(new.amount, 'FM999999990.00'));
    v_body := format('%s is waiting for confirmation.', v_name);
  elsif new.status = 'rejected' then
    v_type := 'recurring_payment_rejected';
    v_title := format('%s marked a payment as not received.', v_actor_name);
    v_body := format('The payment for %s was not confirmed.', v_name);
  elsif tg_op = 'UPDATE' then
    v_type := 'recurring_payment_confirmed';
    v_title := format('%s confirmed receiving RM %s.', v_actor_name, to_char(new.amount, 'FM999999990.00'));
    v_body := format('%s has been updated.', v_name);
  else
    v_type := 'recurring_payment_recorded';
    v_title := format('%s recorded a payment of RM %s.', v_actor_name, to_char(new.amount, 'FM999999990.00'));
    v_body := format('%s has been updated.', v_name);
  end if;

  for v_recipient_user_id in
    select distinct p.linked_user_id
    from unnest(array[new.from_person_id, new.to_person_id]) involved(person_id)
    join public.people p on p.id = involved.person_id
    join public.group_members gm on gm.group_id = v_group_id and gm.person_id = p.id
    where gm.membership_status = 'active'
  loop
    perform private.create_notification(
      v_recipient_user_id, v_actor_user_id, v_type, v_title, v_body,
      v_group_id, 'recurring', new.arrangement_id,
      jsonb_build_object('recurring_name', v_name, 'group_name', v_group_name,
        'amount', new.amount, 'payment_status', new.status),
      format('recurring-payment:%s:%s:%s', new.id, new.status, v_recipient_user_id)
    );
  end loop;
  return new;
end;
$$;

revoke all on function private.notify_recurring_payment() from public, anon, authenticated;
create trigger notify_recurring_payment
after insert or update on public.recurring_payments
for each row execute function private.notify_recurring_payment();

create or replace function private.notify_recurring_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_group_id uuid;
  v_group_name text;
  v_name text;
  v_actor_name text;
  v_recipient_user_id uuid;
  v_type text;
begin
  if v_actor_user_id is null then return new; end if;

  select ra.group_id, g.name, ra.name, coalesce(p.display_name, 'Someone')
  into v_group_id, v_group_name, v_name, v_actor_name
  from public.recurring_arrangements ra
  join public.groups g on g.id = ra.group_id
  left join public.profiles p on p.id = v_actor_user_id
  where ra.id = new.arrangement_id;

  v_type := case when (
    select count(*) from public.recurring_arrangement_versions rav
    where rav.arrangement_id = new.arrangement_id
  ) = 1 then 'recurring_created' else 'recurring_updated' end;

  for v_recipient_user_id in
    select distinct person.linked_user_id
    from public.recurring_version_participants rvp
    join public.people person on person.id = rvp.person_id
    join public.group_members gm
      on gm.group_id = v_group_id and gm.person_id = person.id
    where rvp.version_id = new.id
      and gm.membership_status = 'active'
      and person.linked_user_id is not null
  loop
    perform private.create_notification(
      v_recipient_user_id,
      v_actor_user_id,
      v_type,
      case when v_type = 'recurring_created'
        then format('%s added %s.', v_actor_name, v_name)
        else format('%s updated %s.', v_actor_name, v_name) end,
      case when v_type = 'recurring_created'
        then format('A recurring payment was added in %s.', v_group_name)
        else format('New terms apply from %s.', to_char(new.effective_from, 'Mon YYYY')) end,
      v_group_id,
      'recurring',
      new.arrangement_id,
      jsonb_build_object('recurring_name', v_name, 'group_name', v_group_name,
        'amount', new.total_amount),
      format('recurring-version:%s:%s', new.id, v_recipient_user_id)
    );
  end loop;
  return new;
end;
$$;

revoke all on function private.notify_recurring_version() from public, anon, authenticated;
create constraint trigger notify_recurring_version
after insert on public.recurring_arrangement_versions
deferrable initially deferred
for each row execute function private.notify_recurring_version();
