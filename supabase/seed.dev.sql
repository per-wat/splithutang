-- =========================================================
-- SplitHutang / SplitMate
-- DEVELOPMENT SEED DATA
-- =========================================================
--
-- IMPORTANT:
--
-- 1. This file is DEVELOPMENT DATA ONLY.
--
-- 2. Create your real development Auth user first.
--
-- 3. Replace the email below if necessary:
--
--      ifwat@example.com
--
-- 4. Stage B must already be applied.
--
-- 5. This seed expects the authenticated owner to already
--    have a canonical public.people identity created by
--    handle_new_user().
--
-- This seed creates:
--
-- - Close Friends
-- - Weekend Friends
-- - canonical owner identity
-- - Ahmad
-- - Sarah
-- - Raj
-- - Lisa
-- - sample expenses
-- - item/add-on data
-- - sample IOUs
-- - confirmed historical payments
--
-- It is designed to be safe to re-run in the development
-- database.
-- =========================================================


do $$
declare

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

  v_item2 uuid;


begin


  -- =======================================================
  -- 1. DEVELOPMENT AUTH OWNER
  -- =======================================================

  select id
  into v_owner_id
  from auth.users
  where email = 'ifwat@example.com'
  limit 1;


  if v_owner_id is null then

    raise exception
      'No Auth user found for ifwat@example.com. Update the email in seed.dev.sql.';

  end if;


  -- =======================================================
  -- 2. PROFILE
  -- =======================================================

  insert into public.profiles (
    id,
    display_name
  )
  values (
    v_owner_id,
    'Ifwat'
  )
  on conflict (id)
  do update
  set
    display_name =
      excluded.display_name;


  -- =======================================================
  -- 3. CANONICAL OWNER IDENTITY
  --
  -- Stage B automatically creates this.
  --
  -- Do NOT insert another "You" person.
  -- =======================================================

  select id
  into v_you
  from public.people
  where linked_user_id =
    v_owner_id
  limit 1;


  if v_you is null then

    raise exception
      'Canonical owner identity was not created for the development Auth user.';

  end if;


  update public.people
  set
    avatar_color =
      'bg-blue-600'
  where id =
    v_you;


  -- =======================================================
  -- 4. FIXED DEVELOPMENT GROUP IDs
  -- =======================================================

  v_group_a :=
    '10000000-0000-0000-0000-000000000001';

  v_group_b :=
    '10000000-0000-0000-0000-000000000002';


  -- =======================================================
  -- 5. GROUPS
  -- =======================================================

  insert into public.groups (
    id,
    owner_id,
    name
  )
  values

    (
      v_group_a,
      v_owner_id,
      'Close Friends'
    ),

    (
      v_group_b,
      v_owner_id,
      'Weekend Friends'
    )

  on conflict (id)
  do update
  set
    owner_id =
      excluded.owner_id,

    name =
      excluded.name;


  -- =======================================================
  -- 6. AHMAD
  --
  -- First try to reuse Ahmad already belonging to
  -- Close Friends.
  --
  -- This is important because Ahmad may already be linked
  -- to his own Auth account after Stage B.
  -- =======================================================

  select p.id
  into v_ahmad
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where gm.group_id =
      v_group_a
    and p.name =
      'Ahmad'
  order by p.created_at
  limit 1;


  -- Otherwise reuse an unlinked local Ahmad contact.

  if v_ahmad is null then

    select id
    into v_ahmad
    from public.people
    where owner_id =
        v_owner_id
      and linked_user_id
        is null
      and name =
        'Ahmad'
    order by created_at
    limit 1;

  end if;


  -- Otherwise create Ahmad.

  if v_ahmad is null then

    insert into public.people (
      owner_id,
      name,
      avatar_color
    )
    values (
      v_owner_id,
      'Ahmad',
      'bg-purple-600'
    )
    returning id
    into v_ahmad;

  else

    update public.people
    set
      avatar_color =
        'bg-purple-600'
    where id =
      v_ahmad;

  end if;


  -- =======================================================
  -- 7. SARAH
  -- =======================================================

  select p.id
  into v_sarah
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where gm.group_id =
      v_group_a
    and p.name =
      'Sarah'
  order by p.created_at
  limit 1;


  if v_sarah is null then

    select id
    into v_sarah
    from public.people
    where owner_id =
        v_owner_id
      and linked_user_id
        is null
      and name =
        'Sarah'
    order by created_at
    limit 1;

  end if;


  if v_sarah is null then

    insert into public.people (
      owner_id,
      name,
      avatar_color
    )
    values (
      v_owner_id,
      'Sarah',
      'bg-pink-600'
    )
    returning id
    into v_sarah;

  else

    update public.people
    set
      avatar_color =
        'bg-pink-600'
    where id =
      v_sarah;

  end if;


  -- =======================================================
  -- 8. RAJ
  -- =======================================================

  select p.id
  into v_raj
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where gm.group_id =
      v_group_a
    and p.name =
      'Raj'
  order by p.created_at
  limit 1;


  if v_raj is null then

    select id
    into v_raj
    from public.people
    where owner_id =
        v_owner_id
      and linked_user_id
        is null
      and name =
        'Raj'
    order by created_at
    limit 1;

  end if;


  if v_raj is null then

    insert into public.people (
      owner_id,
      name,
      avatar_color
    )
    values (
      v_owner_id,
      'Raj',
      'bg-orange-600'
    )
    returning id
    into v_raj;

  else

    update public.people
    set
      avatar_color =
        'bg-orange-600'
    where id =
      v_raj;

  end if;


  -- =======================================================
  -- 9. LISA
  -- =======================================================

  select p.id
  into v_lisa
  from public.people p
  join public.group_members gm
    on gm.person_id = p.id
  where gm.group_id =
      v_group_b
    and p.name =
      'Lisa'
  order by p.created_at
  limit 1;


  if v_lisa is null then

    select id
    into v_lisa
    from public.people
    where owner_id =
        v_owner_id
      and linked_user_id
        is null
      and name =
        'Lisa'
    order by created_at
    limit 1;

  end if;


  if v_lisa is null then

    insert into public.people (
      owner_id,
      name,
      avatar_color
    )
    values (
      v_owner_id,
      'Lisa',
      'bg-emerald-600'
    )
    returning id
    into v_lisa;

  else

    update public.people
    set
      avatar_color =
        'bg-emerald-600'
    where id =
      v_lisa;

  end if;


  -- =======================================================
  -- 10. GROUP MEMBERS
  -- =======================================================

  insert into public.group_members (
    group_id,
    person_id,
    role
  )
  values

    (
      v_group_a,
      v_you,
      'owner'
    ),

    (
      v_group_a,
      v_ahmad,
      'member'
    ),

    (
      v_group_a,
      v_sarah,
      'member'
    ),

    (
      v_group_a,
      v_raj,
      'member'
    ),

    (
      v_group_b,
      v_you,
      'owner'
    ),

    (
      v_group_b,
      v_lisa,
      'member'
    )

  on conflict (
    group_id,
    person_id
  )
  do update
  set
    role =
      excluded.role;


  -- =======================================================
  -- 11. EXPENSE 1
  --
  -- Dinner at Seoul Garden
  -- RM180
  -- Equal split
  -- =======================================================

  v_exp1 :=
    '20000000-0000-0000-0000-000000000001';


  insert into public.expenses (
    id,
    owner_id,
    group_id,
    name,
    expense_date,
    paid_by,
    split_method,
    total_amount
  )
  values (
    v_exp1,
    v_owner_id,
    v_group_a,
    'Dinner at Seoul Garden',
    '2026-08-22',
    v_you,
    'equal',
    180.00
  )
  on conflict (id)
  do nothing;


  insert into public.expense_participants (
    expense_id,
    person_id,
    share_amount
  )
  values

    (
      v_exp1,
      v_you,
      45.00
    ),

    (
      v_exp1,
      v_ahmad,
      45.00
    ),

    (
      v_exp1,
      v_sarah,
      45.00
    ),

    (
      v_exp1,
      v_raj,
      45.00
    )

  on conflict (
    expense_id,
    person_id
  )
  do nothing;


  -- =======================================================
  -- 12. EXPENSE 2
  --
  -- Pizza Night
  -- RM85
  -- Ahmad paid
  -- Amount split
  -- =======================================================

  v_exp2 :=
    '20000000-0000-0000-0000-000000000002';


  insert into public.expenses (
    id,
    owner_id,
    group_id,
    name,
    expense_date,
    paid_by,
    split_method,
    total_amount
  )
  values (
    v_exp2,
    v_owner_id,
    v_group_a,
    'Pizza Night',
    '2026-08-19',
    v_ahmad,
    'amount',
    85.00
  )
  on conflict (id)
  do nothing;


  insert into public.expense_participants (
    expense_id,
    person_id,
    share_amount
  )
  values

    (
      v_exp2,
      v_you,
      28.34
    ),

    (
      v_exp2,
      v_ahmad,
      28.33
    ),

    (
      v_exp2,
      v_sarah,
      28.33
    )

  on conflict (
    expense_id,
    person_id
  )
  do nothing;


  -- =======================================================
  -- 13. EXPENSE 3
  --
  -- Grab Ride
  -- RM30
  -- =======================================================

  v_exp3 :=
    '20000000-0000-0000-0000-000000000003';


  insert into public.expenses (
    id,
    owner_id,
    group_id,
    name,
    expense_date,
    paid_by,
    split_method,
    total_amount
  )
  values (
    v_exp3,
    v_owner_id,
    v_group_a,
    'Grab Ride',
    '2026-08-18',
    v_you,
    'equal',
    30.00
  )
  on conflict (id)
  do nothing;


  insert into public.expense_participants (
    expense_id,
    person_id,
    share_amount
  )
  values

    (
      v_exp3,
      v_you,
      10.00
    ),

    (
      v_exp3,
      v_ahmad,
      10.00
    ),

    (
      v_exp3,
      v_raj,
      10.00
    )

  on conflict (
    expense_id,
    person_id
  )
  do nothing;


  -- =======================================================
  -- 14. EXPENSE 4
  --
  -- Weekend BBQ
  -- RM72
  -- Item split
  --
  -- Burger Set       RM50
  -- Extra Cheese      RM4
  -- Extra Meat        RM6
  -- Drinks           RM12
  -- ---------------------
  -- Total            RM72
  --
  -- You + Lisa:
  -- RM36 each
  -- =======================================================

  v_exp4 :=
    '20000000-0000-0000-0000-000000000004';


  insert into public.expenses (
    id,
    owner_id,
    group_id,
    name,
    expense_date,
    paid_by,
    split_method,
    total_amount
  )
  values (
    v_exp4,
    v_owner_id,
    v_group_b,
    'Weekend BBQ',
    '2026-08-16',
    v_you,
    'items',
    72.00
  )
  on conflict (id)
  do nothing;


  insert into public.expense_participants (
    expense_id,
    person_id,
    share_amount
  )
  values

    (
      v_exp4,
      v_you,
      36.00
    ),

    (
      v_exp4,
      v_lisa,
      36.00
    )

  on conflict (
    expense_id,
    person_id
  )
  do nothing;


  -- =======================================================
  -- Burger Set
  -- =======================================================

  v_item1 :=
    '40000000-0000-0000-0000-000000000001';


  insert into public.expense_items (
    id,
    expense_id,
    name,
    amount,
    sort_order
  )
  values (
    v_item1,
    v_exp4,
    'Burger Set',
    50.00,
    1
  )
  on conflict (id)
  do nothing;


  insert into public.expense_item_participants (
    expense_item_id,
    person_id
  )
  values

    (
      v_item1,
      v_you
    ),

    (
      v_item1,
      v_lisa
    )

  on conflict (
    expense_item_id,
    person_id
  )
  do nothing;


  insert into public.expense_item_addons (
    id,
    expense_item_id,
    name,
    amount,
    sort_order
  )
  values

    (
      '50000000-0000-0000-0000-000000000001',
      v_item1,
      'Extra Cheese',
      4.00,
      1
    ),

    (
      '50000000-0000-0000-0000-000000000002',
      v_item1,
      'Extra Meat',
      6.00,
      2
    )

  on conflict (id)
  do nothing;


  -- =======================================================
  -- Drinks
  -- =======================================================

  v_item2 :=
    '40000000-0000-0000-0000-000000000002';


  insert into public.expense_items (
    id,
    expense_id,
    name,
    amount,
    sort_order
  )
  values (
    v_item2,
    v_exp4,
    'Drinks',
    12.00,
    2
  )
  on conflict (id)
  do nothing;


  /*
   * Your old seed was missing the item participants
   * for Drinks.
   *
   * Adding both people makes the stored item breakdown
   * agree with:
   *
   * You  = RM36
   * Lisa = RM36
   */

  insert into public.expense_item_participants (
    expense_item_id,
    person_id
  )
  values

    (
      v_item2,
      v_you
    ),

    (
      v_item2,
      v_lisa
    )

  on conflict (
    expense_item_id,
    person_id
  )
  do nothing;


  -- =======================================================
  -- 15. HISTORICAL PAYMENT
  --
  -- Pizza Night
  -- You → Ahmad
  -- RM10
  --
  -- Explicitly confirmed because this is historical
  -- seed data.
  -- =======================================================

  insert into public.expense_payments (
    id,
    expense_id,
    from_person_id,
    to_person_id,
    amount,
    note,
    status,
    resolved_at
  )
  values (
    '60000000-0000-0000-0000-000000000001',
    v_exp2,
    v_you,
    v_ahmad,
    10.00,
    'Partial payment',
    'confirmed',
    now()
  )
  on conflict (id)
  do nothing;


  -- =======================================================
  -- 16. IOU 1
  --
  -- Ahmad owes You RM25
  -- =======================================================

  v_iou1 :=
    '30000000-0000-0000-0000-000000000001';


  insert into public.ious (
    id,
    owner_id,
    group_id,
    from_person_id,
    to_person_id,
    amount,
    reason,
    iou_date
  )
  values (
    v_iou1,
    v_owner_id,
    v_group_a,
    v_ahmad,
    v_you,
    25.00,
    'Borrowed for parking',
    '2026-08-20'
  )
  on conflict (id)
  do nothing;


  -- =======================================================
  -- 17. IOU 2
  --
  -- You owe Lisa RM17
  -- =======================================================

  v_iou2 :=
    '30000000-0000-0000-0000-000000000002';


  insert into public.ious (
    id,
    owner_id,
    group_id,
    from_person_id,
    to_person_id,
    amount,
    reason,
    iou_date
  )
  values (
    v_iou2,
    v_owner_id,
    v_group_b,
    v_you,
    v_lisa,
    17.00,
    'Movie snacks',
    '2026-08-17'
  )
  on conflict (id)
  do nothing;


  -- =======================================================
  -- 18. HISTORICAL IOU PAYMENT
  --
  -- Ahmad → You
  -- RM5
  -- =======================================================

  insert into public.iou_payments (
    id,
    iou_id,
    from_person_id,
    to_person_id,
    amount,
    note,
    status,
    resolved_by_user_id,
    resolved_at
  )
  values (
    '70000000-0000-0000-0000-000000000001',
    v_iou1,
    v_ahmad,
    v_you,
    5.00,
    'Partial repayment',
    'confirmed',
    v_owner_id,
    now()
  )
  on conflict (id)
  do nothing;


end $$;