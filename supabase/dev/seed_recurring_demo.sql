-- DEV-ONLY visual fixture for Supabase project hnkmtlbldaiesebsqjkk.
--
-- The fixture-user allowlist makes this a no-op in projects without the
-- SplitHutangDev performance identities. It is idempotent: rerunning it
-- replaces only the dedicated demo group below.

do $seed$
declare
  v_group constant uuid := 'de000000-0000-4000-8000-000000000001';
  v_netflix constant uuid := 'de000000-0000-4000-8000-000000000101';
  v_spotify constant uuid := 'de000000-0000-4000-8000-000000000102';
  v_internet constant uuid := 'de000000-0000-4000-8000-000000000103';
  v_parking constant uuid := 'de000000-0000-4000-8000-000000000104';
  v_netflix_v1 constant uuid := 'de000000-0000-4000-8000-000000000201';
  v_netflix_v2 constant uuid := 'de000000-0000-4000-8000-000000000202';
  v_spotify_v1 constant uuid := 'de000000-0000-4000-8000-000000000203';
  v_internet_v1 constant uuid := 'de000000-0000-4000-8000-000000000204';
  v_parking_v1 constant uuid := 'de000000-0000-4000-8000-000000000205';
  u01 uuid;
  u02 uuid;
  u03 uuid;
  u04 uuid;
  u05 uuid;
  u06 uuid;
  u07 uuid;
  p01 uuid;
  p02 uuid;
  p03 uuid;
  p04 uuid;
  p05 uuid;
  p06 uuid;
  p07 uuid;
  v_payment uuid;
  v_row record;
  v_debtor uuid;
begin
  if (
    select count(distinct split_part(email, '@', 1)) <> 10
    from auth.users
    where split_part(email, '@', 1) ~ '^perf\.user(0[1-9]|10)$'
  ) then
    raise notice 'Skipping SplitHutangDev recurring fixtures: project identity does not match';
    return;
  end if;

  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260913153006'
      and name = 'recurring_payments'
  ) then
    raise exception 'Safety stop: recurring_payments migration 20260913153006 is not installed';
  end if;

  select id into strict u01 from auth.users where split_part(email, '@', 1) = 'perf.user01';
  select id into strict u02 from auth.users where split_part(email, '@', 1) = 'perf.user02';
  select id into strict u03 from auth.users where split_part(email, '@', 1) = 'perf.user03';
  select id into strict u04 from auth.users where split_part(email, '@', 1) = 'perf.user04';
  select id into strict u05 from auth.users where split_part(email, '@', 1) = 'perf.user05';
  select id into strict u06 from auth.users where split_part(email, '@', 1) = 'perf.user06';
  select id into strict u07 from auth.users where split_part(email, '@', 1) = 'perf.user07';

  select id into strict p01 from public.people where linked_user_id = u01;
  select id into strict p02 from public.people where linked_user_id = u02;
  select id into strict p03 from public.people where linked_user_id = u03;
  select id into strict p04 from public.people where linked_user_id = u04;
  select id into strict p05 from public.people where linked_user_id = u05;
  select id into strict p06 from public.people where linked_user_id = u06;
  select id into strict p07 from public.people where linked_user_id = u07;

  -- Cascades remove only this fixture's arrangements, snapshots and payments.
  delete from public.groups where id = v_group;

  insert into public.groups (id, owner_id, name, allow_debtor_self_confirm)
  values (v_group, u01, 'Recurring Payments Demo', false);

  insert into public.group_members (group_id, person_id, role, membership_status)
  values
    (v_group, p01, 'owner', 'active'),
    (v_group, p02, 'member', 'active'),
    (v_group, p03, 'member', 'active'),
    (v_group, p04, 'member', 'active'),
    (v_group, p05, 'member', 'active'),
    (v_group, p06, 'member', 'active'),
    (v_group, p07, 'member', 'active');

  insert into public.recurring_arrangements (
    id, owner_id, group_id, name, payer_person_id, frequency,
    start_date, end_date, status
  )
  values
    (v_netflix, u01, v_group, 'Netflix Family', p01, 'monthly',
      date '2026-01-01', null, 'active'),
    (v_spotify, u02, v_group, 'Spotify Family', p02, 'monthly',
      date '2026-09-01', null, 'active'),
    (v_internet, u03, v_group, 'Apartment Internet', p03, 'monthly',
      date '2026-04-01', null, 'active'),
    (v_parking, u04, v_group, 'Parking Pass', p04, 'monthly',
      date '2026-03-01', date '2026-08-31', 'ended');

  insert into public.recurring_arrangement_versions (
    id, arrangement_id, effective_from, total_amount, due_day, created_by_user_id
  )
  values
    (v_netflix_v1, v_netflix, date '2026-01-01', 54.99, 15, u01),
    (v_netflix_v2, v_netflix, date '2026-07-01', 59.97, 15, u01),
    (v_spotify_v1, v_spotify, date '2026-09-01', 47.40, 10, u02),
    (v_internet_v1, v_internet, date '2026-04-01', 150.00, 5, u03),
    (v_parking_v1, v_parking, date '2026-03-01', 120.00, 1, u04);

  insert into public.recurring_version_participants (version_id, person_id, share_amount)
  values
    (v_netflix_v1, p01, 18.33),
    (v_netflix_v1, p02, 18.33),
    (v_netflix_v1, p03, 18.33),
    (v_netflix_v2, p01, 19.99),
    (v_netflix_v2, p02, 19.99),
    (v_netflix_v2, p03, 19.99),
    (v_spotify_v1, p02, 15.80),
    (v_spotify_v1, p04, 15.80),
    (v_spotify_v1, p05, 15.80),
    (v_internet_v1, p03, 50.00),
    (v_internet_v1, p01, 50.00),
    (v_internet_v1, p06, 50.00),
    (v_parking_v1, p04, 60.00),
    (v_parking_v1, p07, 60.00);

  perform private.generate_recurring_periods(v_netflix, date '2026-01-01', date '2026-12-31');
  perform private.generate_recurring_periods(v_spotify, date '2026-01-01', date '2026-12-31');
  perform private.generate_recurring_periods(v_internet, date '2026-01-01', date '2026-12-31');
  perform private.generate_recurring_periods(v_parking, date '2026-01-01', date '2026-12-31');

  -- Netflix: paid Jan-Aug, due in Sep, paid early in Oct-Nov, upcoming in Dec.
  for v_row in
    select ro.id as obligation_id, ro.person_id, ro.share_amount, rp.due_date
    from public.recurring_obligations ro
    join public.recurring_periods rp on rp.id = ro.period_id
    where rp.arrangement_id = v_netflix
      and rp.period_start between date '2026-01-01' and date '2026-08-01'
  loop
    insert into public.recurring_payments (
      arrangement_id, from_person_id, to_person_id, amount, paid_at, note,
      status, submitted_by_user_id, resolved_by_user_id, resolved_at
    )
    values (
      v_netflix, v_row.person_id, p01, v_row.share_amount,
      v_row.due_date::timestamptz + interval '1 day 12 hours',
      'Recurring demo: confirmed monthly payment', 'confirmed',
      (select linked_user_id from public.people where id = v_row.person_id),
      u01, v_row.due_date::timestamptz + interval '1 day 12 hours'
    )
    returning id into v_payment;

    insert into public.recurring_payment_allocations (payment_id, obligation_id, amount)
    values (v_payment, v_row.obligation_id, v_row.share_amount);

    update public.recurring_obligations
    set payment_status = 'paid'
    where id = v_row.obligation_id;
  end loop;

  foreach v_debtor in array array[p02, p03]
  loop
    insert into public.recurring_payments (
      arrangement_id, from_person_id, to_person_id, amount, paid_at, note,
      status, submitted_by_user_id, resolved_by_user_id, resolved_at
    )
    values (
      v_netflix, v_debtor, p01, 39.98, timestamptz '2026-09-05 12:00:00+08',
      'Recurring demo: October and November paid together in advance',
      'confirmed',
      (select linked_user_id from public.people where id = v_debtor),
      u01, timestamptz '2026-09-05 12:00:00+08'
    )
    returning id into v_payment;

    insert into public.recurring_payment_allocations (payment_id, obligation_id, amount)
    select v_payment, ro.id, ro.share_amount
    from public.recurring_obligations ro
    join public.recurring_periods rp on rp.id = ro.period_id
    where rp.arrangement_id = v_netflix
      and ro.person_id = v_debtor
      and rp.period_start in (date '2026-10-01', date '2026-11-01');

    update public.recurring_obligations ro
    set payment_status = 'paid'
    from public.recurring_periods rp
    where rp.id = ro.period_id
      and rp.arrangement_id = v_netflix
      and ro.person_id = v_debtor
      and rp.period_start in (date '2026-10-01', date '2026-11-01');
  end loop;

  -- Spotify: September began this month. One participant is awaiting receiver
  -- confirmation and another still owes their share.
  insert into public.recurring_payments (
    arrangement_id, from_person_id, to_person_id, amount, paid_at, note,
    status, submitted_by_user_id
  )
  values (
    v_spotify, p04, p02, 15.80, timestamptz '2026-09-10 09:30:00+08',
    'Recurring demo: pending receiver confirmation', 'pending', u04
  )
  returning id into v_payment;

  insert into public.recurring_payment_allocations (payment_id, obligation_id, amount)
  select v_payment, ro.id, ro.share_amount
  from public.recurring_obligations ro
  join public.recurring_periods rp on rp.id = ro.period_id
  where rp.arrangement_id = v_spotify
    and rp.period_start = date '2026-09-01'
    and ro.person_id = p04;

  update public.recurring_obligations ro
  set payment_status = 'pending'
  from public.recurring_periods rp
  where rp.id = ro.period_id
    and rp.arrangement_id = v_spotify
    and rp.period_start = date '2026-09-01'
    and ro.person_id = p04;

  -- Internet: paid history, an explicitly skipped August and a current due month.
  for v_row in
    select ro.id as obligation_id, ro.person_id, ro.share_amount, rp.due_date
    from public.recurring_obligations ro
    join public.recurring_periods rp on rp.id = ro.period_id
    where rp.arrangement_id = v_internet
      and rp.period_start between date '2026-04-01' and date '2026-07-01'
  loop
    insert into public.recurring_payments (
      arrangement_id, from_person_id, to_person_id, amount, paid_at, note,
      status, submitted_by_user_id, resolved_by_user_id, resolved_at
    )
    values (
      v_internet, v_row.person_id, p03, v_row.share_amount,
      v_row.due_date::timestamptz + interval '2 days 12 hours',
      'Recurring demo: confirmed internet payment', 'confirmed',
      (select linked_user_id from public.people where id = v_row.person_id),
      u03, v_row.due_date::timestamptz + interval '2 days 12 hours'
    )
    returning id into v_payment;

    insert into public.recurring_payment_allocations (payment_id, obligation_id, amount)
    values (v_payment, v_row.obligation_id, v_row.share_amount);

    update public.recurring_obligations
    set payment_status = 'paid'
    where id = v_row.obligation_id;
  end loop;

  update public.recurring_periods
  set state = 'skipped', skip_reason = 'Demo: provider waived the August bill'
  where arrangement_id = v_internet
    and period_start = date '2026-08-01';

  update public.recurring_obligations ro
  set payment_status = 'skipped'
  from public.recurring_periods rp
  where rp.id = ro.period_id
    and rp.arrangement_id = v_internet
    and rp.period_start = date '2026-08-01';

  -- Parking: a fully paid ended arrangement. Sep-Dec remain not applicable.
  for v_row in
    select ro.id as obligation_id, ro.share_amount, rp.due_date
    from public.recurring_obligations ro
    join public.recurring_periods rp on rp.id = ro.period_id
    where rp.arrangement_id = v_parking
  loop
    insert into public.recurring_payments (
      arrangement_id, from_person_id, to_person_id, amount, paid_at, note,
      status, submitted_by_user_id, resolved_by_user_id, resolved_at
    )
    values (
      v_parking, p07, p04, v_row.share_amount,
      v_row.due_date::timestamptz + interval '1 day 12 hours',
      'Recurring demo: confirmed parking payment', 'confirmed',
      u07, u04, v_row.due_date::timestamptz + interval '1 day 12 hours'
    )
    returning id into v_payment;

    insert into public.recurring_payment_allocations (payment_id, obligation_id, amount)
    values (v_payment, v_row.obligation_id, v_row.share_amount);

    update public.recurring_obligations
    set payment_status = 'paid'
    where id = v_row.obligation_id;
  end loop;
end
$seed$;
