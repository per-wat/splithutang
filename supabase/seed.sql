-- SplitMate development seed data
-- IMPORTANT:
-- 1. Create your real development Auth user first in Supabase Authentication.
-- 2. Replace the email below with that user's email.
-- 3. Run this seed in Supabase SQL Editor.
--
-- This seed creates:
-- - two friend groups
-- - your local "You" person
-- - Ahmad, Sarah, Raj, Lisa
-- - several expenses, item/add-on data, IOUs and payments
--
-- It is intentionally safe to re-run: existing rows with the same names are reused.

do $$
declare
  v_owner_name text;
  v_owner_id uuid;
  v_you uuid;
  v_ahmad uuid;
  v_sarah uuid;
  v_raj uuid;
  v_lisa uuid;
  v_group_a uuid;
  v_group_b uuid;
  v_exp1 uuid;
  v_exp2 uuid;
  v_exp3 uuid;
  v_exp4 uuid;
  v_iou1 uuid;
  v_iou2 uuid;
  v_item1 uuid;
begin
  select id into v_owner_id
  from auth.users
  where email = 'ifwat@example.com'
  limit 1;

  if v_owner_id is null then
    raise exception 'No Auth user found. Replace YOUR_AUTH_EMAIL_HERE with your Supabase Auth email.';
  end if;

  insert into public.profiles (id, display_name)
  values (v_owner_id, 'Ifwat')
  on conflict (id) do update
    set display_name = excluded.display_name;
  
  select display_name
  into v_owner_name
  from public.profiles
  where id = v_owner_id;

  insert into public.people (owner_id, name, avatar_color, linked_user_id)
  values
    (v_owner_id, v_owner_name, 'bg-blue-600', v_owner_id),
    (v_owner_id, 'Ahmad', 'bg-purple-600', null),
    (v_owner_id, 'Sarah', 'bg-pink-600',   null),
    (v_owner_id, 'Raj',   'bg-orange-600', null),
    (v_owner_id, 'Lisa',  'bg-emerald-600', null)
  on conflict (owner_id, name) do update
    set avatar_color = excluded.avatar_color;

  select id into v_you from public.people where linked_user_id = v_owner_id;
  select id into v_ahmad from public.people where owner_id = v_owner_id and name = 'Ahmad';
  select id into v_sarah from public.people where owner_id = v_owner_id and name = 'Sarah';
  select id into v_raj from public.people where owner_id = v_owner_id and name = 'Raj';
  select id into v_lisa from public.people where owner_id = v_owner_id and name = 'Lisa';

  v_group_a := '10000000-0000-0000-0000-000000000001';
  v_group_b := '10000000-0000-0000-0000-000000000002';

  insert into public.groups (id, owner_id, name)
  values
    (v_group_a, v_owner_id, 'Close Friends'),
    (v_group_b, v_owner_id, 'Weekend Friends')
  on conflict (id) do nothing;

  insert into public.group_members (group_id, person_id, role)
  values
    (v_group_a, v_you, 'owner'),
    (v_group_a, v_ahmad, 'member'),
    (v_group_a, v_sarah, 'member'),
    (v_group_a, v_raj, 'member'),
    (v_group_b, v_you, 'owner'),
    (v_group_b, v_lisa, 'member')
  on conflict (group_id, person_id) do update
    set role = excluded.role;

  -- Expense 1: Dinner at Seoul Garden, Close Friends, RM180, equal split.
  v_exp1 := '20000000-0000-0000-0000-000000000001';
  insert into public.expenses
    (id, owner_id, group_id, name, expense_date, paid_by, split_method, total_amount)
  values
    (v_exp1, v_owner_id, v_group_a, 'Dinner at Seoul Garden', '2026-08-22', v_you, 'equal', 180.00)
  on conflict (id) do nothing;

  insert into public.expense_participants (expense_id, person_id, share_amount)
  values
    (v_exp1, v_you, 45.00),
    (v_exp1, v_ahmad, 45.00),
    (v_exp1, v_sarah, 45.00),
    (v_exp1, v_raj, 45.00)
  on conflict (expense_id, person_id) do nothing;

  -- Expense 2: Pizza Night, Close Friends, RM85, paid by Ahmad.
  v_exp2 := '20000000-0000-0000-0000-000000000002';
  insert into public.expenses
    (id, owner_id, group_id, name, expense_date, paid_by, split_method, total_amount)
  values
    (v_exp2, v_owner_id, v_group_a, 'Pizza Night', '2026-08-19', v_ahmad, 'amount', 85.00)
  on conflict (id) do nothing;

  insert into public.expense_participants (expense_id, person_id, share_amount)
  values
    (v_exp2, v_you, 28.34),
    (v_exp2, v_ahmad, 28.33),
    (v_exp2, v_sarah, 28.33)
  on conflict (expense_id, person_id) do nothing;

  -- Expense 3: Grab Ride, Close Friends, RM30.
  v_exp3 := '20000000-0000-0000-0000-000000000003';
  insert into public.expenses
    (id, owner_id, group_id, name, expense_date, paid_by, split_method, total_amount)
  values
    (v_exp3, v_owner_id, v_group_a, 'Grab Ride', '2026-08-18', v_you, 'equal', 30.00)
  on conflict (id) do nothing;

  insert into public.expense_participants (expense_id, person_id, share_amount)
  values
    (v_exp3, v_you, 10.00),
    (v_exp3, v_ahmad, 10.00),
    (v_exp3, v_raj, 10.00)
  on conflict (expense_id, person_id) do nothing;

  -- Expense 4: Weekend BBQ, Weekend Friends, RM72, with item/add-on hierarchy.
  v_exp4 := '20000000-0000-0000-0000-000000000004';
  insert into public.expenses
    (id, owner_id, group_id, name, expense_date, paid_by, split_method, total_amount)
  values
    (v_exp4, v_owner_id, v_group_b, 'Weekend BBQ', '2026-08-16', v_you, 'items', 72.00)
  on conflict (id) do nothing;

  insert into public.expense_participants (expense_id, person_id, share_amount)
  values
    (v_exp4, v_you, 36.00),
    (v_exp4, v_lisa, 36.00);

  v_item1 := '40000000-0000-0000-0000-000000000001';
  insert into public.expense_items (id, expense_id, name, amount, sort_order)
  values (v_item1, v_exp4, 'Burger Set', 50.00, 1)
  on conflict (id) do nothing;

  insert into public.expense_item_participants (expense_item_id, person_id)
  values
    (v_item1, v_you),
    (v_item1, v_lisa)
  on conflict (expense_item_id, person_id) do nothing;

  insert into public.expense_item_addons
    (id, expense_item_id, name, amount, sort_order)
  values
    ('50000000-0000-0000-0000-000000000001', v_item1, 'Extra Cheese', 4.00, 1),
    ('50000000-0000-0000-0000-000000000002', v_item1, 'Extra Meat', 6.00, 2)
  on conflict (id) do nothing;

  insert into public.expense_items (id, expense_id, name, amount, sort_order)
  values
    ('40000000-0000-0000-0000-000000000002', v_exp4, 'Drinks', 12.00, 2)
  on conflict (id) do nothing;

  -- One payment against Pizza Night.
  insert into public.expense_payments
    (id, expense_id, from_person_id, to_person_id, amount, note)
  values
    ('60000000-0000-0000-0000-000000000001', v_exp2, v_you, v_ahmad, 10.00, 'Partial payment')
  on conflict (id) do nothing;

  -- IOU 1: Ahmad owes You RM25.
  v_iou1 := '30000000-0000-0000-0000-000000000001';
  insert into public.ious
    (id, owner_id, group_id, from_person_id, to_person_id, amount, reason, iou_date)
  values
    (v_iou1, v_owner_id, v_group_a, v_ahmad, v_you, 25.00, 'Borrowed for parking', '2026-08-20')
  on conflict (id) do nothing;

  -- IOU 2: You owe Lisa RM17.
  v_iou2 := '30000000-0000-0000-0000-000000000002';
  insert into public.ious
    (id, owner_id, group_id, from_person_id, to_person_id, amount, reason, iou_date)
  values
    (v_iou2, v_owner_id, v_group_b, v_you, v_lisa, 17.00, 'Movie snacks', '2026-08-17')
  on conflict (id) do nothing;

  -- Partial payment on the first IOU.
  insert into public.iou_payments
    (id, iou_id, from_person_id, to_person_id, amount, note)
  values
    ('70000000-0000-0000-0000-000000000001', v_iou1, v_ahmad, v_you, 5.00, 'Partial repayment')
  on conflict (id) do nothing;

end $$;
