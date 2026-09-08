-- Persist reviewed receipt structure without storing receipt images or raw OCR text.
alter table public.expenses
  add column receipt_subtotal numeric(12,2),
  add column receipt_service_charge numeric(12,2),
  add column receipt_tax numeric(12,2),
  add column receipt_rounding numeric(12,2);

alter table public.expenses
  add constraint expenses_receipt_subtotal_nonnegative
    check (receipt_subtotal is null or receipt_subtotal >= 0),
  add constraint expenses_receipt_service_charge_nonnegative
    check (receipt_service_charge is null or receipt_service_charge >= 0),
  add constraint expenses_receipt_tax_nonnegative
    check (receipt_tax is null or receipt_tax >= 0),
  add constraint expenses_receipt_fields_require_subtotal
    check (
      receipt_subtotal is not null
      or (
        receipt_service_charge is null
        and receipt_tax is null
        and receipt_rounding is null
      )
    ),
  add constraint expenses_receipt_total_matches
    check (
      receipt_subtotal is null
      or round(
        receipt_subtotal
        + coalesce(receipt_service_charge, 0)
        + coalesce(receipt_tax, 0)
        + coalesce(receipt_rounding, 0),
        2
      ) = total_amount
    );

alter table public.expense_items
  add column quantity integer not null default 1,
  add constraint expense_items_quantity_positive check (quantity > 0);

alter table public.expense_item_addons
  add column quantity integer not null default 1,
  add constraint expense_item_addons_quantity_positive check (quantity > 0);

-- The extra defaulted JSON argument keeps existing callers compatible.
drop function public.create_expense(
  uuid,
  text,
  date,
  uuid,
  public.split_method,
  numeric,
  jsonb,
  jsonb
);

create or replace function public.create_expense(
  p_group_id uuid,
  p_name text,
  p_expense_date date,
  p_paid_by uuid,
  p_split_method public.split_method,
  p_total_amount numeric,
  p_participants jsonb,
  p_items jsonb default '[]'::jsonb,
  p_receipt_summary jsonb default null
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
  v_expense_id uuid;

  v_participant jsonb;
  v_participant_id uuid;
  v_participant_count integer;
  v_seen_participants uuid[] := array[]::uuid[];

  v_total_cents bigint;
  v_share_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
  v_sum_cents bigint := 0;
  v_index integer;

  -- person UUID -> share in integer cents
  v_share_map jsonb := '{}'::jsonb;
  v_current_cents bigint;

  v_item jsonb;
  v_item_id uuid;
  v_item_index integer;
  v_item_name text;
  v_item_amount numeric;
  v_item_quantity integer;
  v_item_total_cents bigint;
  v_items_total_cents bigint := 0;
  v_item_share_map jsonb;

  v_item_people jsonb;
  v_item_person_text text;
  v_item_person_id uuid;
  v_item_people_count integer;
  v_item_base_cents bigint;
  v_item_remainder bigint;
  v_item_person_index integer;

  v_sub_item jsonb;
  v_sub_index integer;
  v_sub_name text;
  v_sub_amount numeric;
  v_sub_quantity integer;

  v_has_receipt_summary boolean := false;
  v_receipt_subtotal numeric;
  v_receipt_service_charge numeric;
  v_receipt_tax numeric;
  v_receipt_rounding numeric;
  v_receipt_subtotal_cents bigint;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Expense name is required';
  end if;

  if p_expense_date is null then
    raise exception 'Expense date is required';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Expense total must be greater than zero';
  end if;

  if p_participants is null
     or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'At least one participant is required';
  end if;

  select g.owner_id
  into v_group_owner_id
  from public.groups g
  where g.id = p_group_id;

  if v_group_owner_id is null then
    raise exception 'Group not found';
  end if;

  -- Payer must belong to this group.
  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.person_id = p_paid_by
  ) then
    raise exception 'Payer must be a member of this group';
  end if;

  -- If caller is not group owner, resolve their person record.
  if v_group_owner_id <> v_user_id then
    select p.id
    into v_self_person_id
    from public.people p
    join public.group_members gm
      on gm.person_id = p.id
    where p.linked_user_id = v_user_id
      and gm.group_id = p_group_id
    limit 1;

    if v_self_person_id is null then
      raise exception 'You are not a member of this group';
    end if;
  end if;

  /*
   * Validate top-level participants and initialise their shares.
   */
  for v_participant in
    select value
    from jsonb_array_elements(p_participants)
  loop
    begin
      v_participant_id :=
        (v_participant ->> 'person_id')::uuid;
    exception when others then
      raise exception 'Invalid participant';
    end;

    if v_participant_id = any(v_seen_participants) then
      raise exception 'Duplicate participant';
    end if;

    if not exists (
      select 1
      from public.group_members gm
      where gm.group_id = p_group_id
        and gm.person_id = v_participant_id
    ) then
      raise exception 'Participant is not a member of this group';
    end if;

    v_seen_participants :=
      array_append(v_seen_participants, v_participant_id);

    v_share_map :=
      jsonb_set(
        v_share_map,
        array[v_participant_id::text],
        to_jsonb(0::bigint),
        true
      );
  end loop;

  v_participant_count := array_length(v_seen_participants, 1);

  -- A regular member may only create an expense that involves themselves.
  if v_group_owner_id <> v_user_id
     and p_paid_by <> v_self_person_id
     and not (v_self_person_id = any(v_seen_participants)) then
    raise exception 'You can only create expenses that involve you';
  end if;

  v_total_cents :=
    round(p_total_amount * 100)::bigint;

  /*
   * A reviewed receipt stores only structured monetary fields. The source
   * image and raw OCR text never enter the database.
   */
  if p_receipt_summary is not null
     and p_receipt_summary <> 'null'::jsonb then
    if jsonb_typeof(p_receipt_summary) <> 'object' then
      raise exception 'Invalid receipt summary';
    end if;

    begin
      v_receipt_subtotal :=
        (p_receipt_summary ->> 'subtotal')::numeric;
      v_receipt_service_charge :=
        coalesce(
          nullif(p_receipt_summary ->> 'service_charge', ''),
          '0'
        )::numeric;
      v_receipt_tax :=
        coalesce(
          nullif(p_receipt_summary ->> 'tax', ''),
          '0'
        )::numeric;
      v_receipt_rounding :=
        coalesce(
          nullif(p_receipt_summary ->> 'rounding', ''),
          '0'
        )::numeric;
    exception when others then
      raise exception 'Invalid receipt summary amounts';
    end;

    if v_receipt_subtotal is null or v_receipt_subtotal < 0 then
      raise exception 'Receipt subtotal must be zero or greater';
    end if;

    if v_receipt_service_charge < 0 then
      raise exception 'Receipt service charge cannot be negative';
    end if;

    if v_receipt_tax < 0 then
      raise exception 'Receipt tax cannot be negative';
    end if;

    -- Persist and compare exactly the same two-decimal amounts used by the UI.
    v_receipt_subtotal := round(v_receipt_subtotal, 2);
    v_receipt_service_charge := round(v_receipt_service_charge, 2);
    v_receipt_tax := round(v_receipt_tax, 2);
    v_receipt_rounding := round(v_receipt_rounding, 2);

    v_receipt_subtotal_cents :=
      round(v_receipt_subtotal * 100)::bigint;

    if v_receipt_subtotal_cents
       + round(v_receipt_service_charge * 100)::bigint
       + round(v_receipt_tax * 100)::bigint
       + round(v_receipt_rounding * 100)::bigint
       <> v_total_cents then
      raise exception
        'Receipt subtotal and adjustments must equal the expense total';
    end if;

    v_has_receipt_summary := true;
  end if;

  if v_has_receipt_summary and p_split_method <> 'items' then
    raise exception 'Receipt breakdown requires item splitting';
  end if;


  /*
   * EQUAL
   */
  if p_split_method = 'equal' then
    v_base_cents :=
      v_total_cents / v_participant_count;

    v_remainder :=
      mod(
        v_total_cents,
        v_participant_count::bigint
      );

    v_index := 0;

    for v_participant in
      select value
      from jsonb_array_elements(p_participants)
    loop
      v_index := v_index + 1;

      v_participant_id :=
        (v_participant ->> 'person_id')::uuid;

      v_share_cents :=
        v_base_cents
        + case
            when v_index <= v_remainder then 1
            else 0
          end;

      v_share_map :=
        jsonb_set(
          v_share_map,
          array[v_participant_id::text],
          to_jsonb(v_share_cents),
          true
        );
    end loop;


  /*
   * BY AMOUNT
   */
  elsif p_split_method = 'amount' then
    v_sum_cents := 0;

    for v_participant in
      select value
      from jsonb_array_elements(p_participants)
    loop
      v_participant_id :=
        (v_participant ->> 'person_id')::uuid;

      begin
        v_share_cents :=
          round(
            (v_participant ->> 'share_amount')::numeric
            * 100
          )::bigint;
      exception when others then
        raise exception 'Invalid participant amount';
      end;

      if v_share_cents < 0 then
        raise exception 'Participant amount cannot be negative';
      end if;

      v_sum_cents :=
        v_sum_cents + v_share_cents;

      v_share_map :=
        jsonb_set(
          v_share_map,
          array[v_participant_id::text],
          to_jsonb(v_share_cents),
          true
        );
    end loop;

    if v_sum_cents <> v_total_cents then
      raise exception
        'Participant amounts must equal the expense total';
    end if;


  /*
   * BY ITEMS
   */
  elsif p_split_method = 'items' then
    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
      raise exception 'At least one item is required';
    end if;

    for v_item, v_item_index in
      select value, ordinality::integer
      from jsonb_array_elements(p_items)
           with ordinality
    loop
      v_item_name :=
        trim(coalesce(v_item ->> 'name', ''));

      if v_item_name = '' then
        raise exception 'Every item requires a name';
      end if;

      begin
        v_item_amount :=
          coalesce(
            nullif(v_item ->> 'amount', ''),
            '0'
          )::numeric;
      exception when others then
        raise exception 'Invalid item amount';
      end;

      if v_item_amount < 0 then
        raise exception 'Item amount cannot be negative';
      end if;

      begin
        v_item_quantity :=
          coalesce(
            nullif(v_item ->> 'quantity', ''),
            '1'
          )::integer;
      exception when others then
        raise exception 'Invalid item quantity';
      end;

      if v_item_quantity < 1 then
        raise exception 'Item quantity must be at least one';
      end if;

      v_item_total_cents :=
        round(v_item_amount * 100)::bigint;

      -- Add-ons belong to and are shared with the parent item.
      if jsonb_typeof(
        coalesce(v_item -> 'sub_items', '[]'::jsonb)
      ) <> 'array' then
        raise exception 'Invalid add-on list';
      end if;

      for v_sub_item, v_sub_index in
        select value, ordinality::integer
        from jsonb_array_elements(
          coalesce(v_item -> 'sub_items', '[]'::jsonb)
        ) with ordinality
      loop
        v_sub_name :=
          trim(coalesce(v_sub_item ->> 'name', ''));

        if v_sub_name = '' then
          raise exception 'Every add-on requires a name';
        end if;

        begin
          v_sub_amount :=
            coalesce(
              nullif(v_sub_item ->> 'amount', ''),
              '0'
            )::numeric;
        exception when others then
          raise exception 'Invalid add-on amount';
        end;

        if v_sub_amount < 0 then
          raise exception 'Add-on amount cannot be negative';
        end if;

        begin
          v_sub_quantity :=
            coalesce(
              nullif(v_sub_item ->> 'quantity', ''),
              '1'
            )::integer;
        exception when others then
          raise exception 'Invalid add-on quantity';
        end;

        if v_sub_quantity < 1 then
          raise exception 'Add-on quantity must be at least one';
        end if;

        v_item_total_cents :=
          v_item_total_cents
          + round(v_sub_amount * 100)::bigint;
      end loop;

      v_items_total_cents :=
        v_items_total_cents
        + v_item_total_cents;

      v_item_people :=
        coalesce(v_item -> 'people', '[]'::jsonb);

      if jsonb_typeof(v_item_people) <> 'array'
         or jsonb_array_length(v_item_people) = 0 then
        raise exception 'Every item must be shared by at least one person';
      end if;

      v_item_people_count :=
        jsonb_array_length(v_item_people);

      v_item_base_cents :=
        v_item_total_cents / v_item_people_count;

      v_item_remainder :=
        mod(
          v_item_total_cents,
          v_item_people_count::bigint
        );

      v_item_person_index := 0;

      for v_item_person_text in
        select value
        from jsonb_array_elements_text(v_item_people)
      loop
        v_item_person_index :=
          v_item_person_index + 1;

        begin
          v_item_person_id :=
            v_item_person_text::uuid;
        exception when others then
          raise exception 'Invalid item participant';
        end;

        if not (
          v_item_person_id = any(v_seen_participants)
        ) then
          raise exception
            'Item participant must also be involved in the expense';
        end if;

        v_share_cents :=
          v_item_base_cents
          + case
              when v_item_person_index <= v_item_remainder
                then 1
              else 0
            end;

        v_current_cents :=
          coalesce(
            (v_share_map ->> v_item_person_id::text)::bigint,
            0
          );

        v_share_map :=
          jsonb_set(
            v_share_map,
            array[v_item_person_id::text],
            to_jsonb(v_current_cents + v_share_cents),
            true
          );
      end loop;
    end loop;

    if v_items_total_cents < 1 then
      raise exception 'Item subtotal must be greater than zero';
    end if;

    if v_has_receipt_summary
       and v_items_total_cents <> v_receipt_subtotal_cents then
      raise exception 'Item totals must equal the receipt subtotal';
    end if;

    if not v_has_receipt_summary
       and v_items_total_cents <> v_total_cents then
      raise exception 'Item totals must equal the expense total';
    end if;

    /*
     * Service charge, tax and rounding follow the people who shared the
     * underlying items. Scaling the item-derived shares in integer cents
     * keeps the final participant sum exact and avoids assigning charges to
     * an unrelated person.
     */
    if v_has_receipt_summary
       and v_total_cents <> v_items_total_cents then
      v_item_share_map := v_share_map;
      v_sum_cents := 0;

      for v_participant in
        select value
        from jsonb_array_elements(p_participants)
      loop
        v_participant_id :=
          (v_participant ->> 'person_id')::uuid;

        v_current_cents :=
          coalesce(
            (v_item_share_map ->> v_participant_id::text)::bigint,
            0
          );

        v_share_cents :=
          floor(
            v_current_cents::numeric
            * v_total_cents::numeric
            / v_items_total_cents::numeric
          )::bigint;

        v_share_map :=
          jsonb_set(
            v_share_map,
            array[v_participant_id::text],
            to_jsonb(v_share_cents),
            true
          );

        v_sum_cents := v_sum_cents + v_share_cents;
      end loop;

      v_remainder := v_total_cents - v_sum_cents;

      for v_participant in
        select value
        from jsonb_array_elements(p_participants)
      loop
        exit when v_remainder = 0;

        v_participant_id :=
          (v_participant ->> 'person_id')::uuid;

        v_current_cents :=
          coalesce(
            (v_item_share_map ->> v_participant_id::text)::bigint,
            0
          );

        if v_current_cents > 0 then
          v_share_cents :=
            coalesce(
              (v_share_map ->> v_participant_id::text)::bigint,
              0
            ) + 1;

          v_share_map :=
            jsonb_set(
              v_share_map,
              array[v_participant_id::text],
              to_jsonb(v_share_cents),
              true
            );

          v_remainder := v_remainder - 1;
        end if;
      end loop;
    end if;

  else
    raise exception 'Unsupported split method';
  end if;


  /*
   * Create expense.
   */
  insert into public.expenses (
    owner_id,
    group_id,
    name,
    expense_date,
    paid_by,
    split_method,
    total_amount,
    receipt_subtotal,
    receipt_service_charge,
    receipt_tax,
    receipt_rounding
  )
  values (
    v_user_id,
    p_group_id,
    trim(p_name),
    p_expense_date,
    p_paid_by,
    p_split_method,
    p_total_amount,
    case when v_has_receipt_summary then v_receipt_subtotal else null end,
    case when v_has_receipt_summary then v_receipt_service_charge else null end,
    case when v_has_receipt_summary then v_receipt_tax else null end,
    case when v_has_receipt_summary then v_receipt_rounding else null end
  )
  returning id into v_expense_id;


  /*
   * Store final participant shares.
   */
  for v_participant in
    select value
    from jsonb_array_elements(p_participants)
  loop
    v_participant_id :=
      (v_participant ->> 'person_id')::uuid;

    v_share_cents :=
      coalesce(
        (v_share_map ->> v_participant_id::text)::bigint,
        0
      );

    insert into public.expense_participants (
      expense_id,
      person_id,
      share_amount
    )
    values (
      v_expense_id,
      v_participant_id,
      v_share_cents::numeric / 100
    );
  end loop;


  /*
   * Store item hierarchy when using item split.
   */
  if p_split_method = 'items' then
    for v_item, v_item_index in
      select value, ordinality::integer
      from jsonb_array_elements(p_items)
           with ordinality
    loop
      insert into public.expense_items (
        expense_id,
        name,
        amount,
        quantity,
        sort_order
      )
      values (
        v_expense_id,
        trim(v_item ->> 'name'),
        coalesce(
          nullif(v_item ->> 'amount', ''),
          '0'
        )::numeric,
        coalesce(
          nullif(v_item ->> 'quantity', ''),
          '1'
        )::integer,
        v_item_index
      )
      returning id into v_item_id;

      for v_item_person_text in
        select value
        from jsonb_array_elements_text(
          v_item -> 'people'
        )
      loop
        insert into public.expense_item_participants (
          expense_item_id,
          person_id
        )
        values (
          v_item_id,
          v_item_person_text::uuid
        );
      end loop;

      for v_sub_item, v_sub_index in
        select value, ordinality::integer
        from jsonb_array_elements(
          coalesce(v_item -> 'sub_items', '[]'::jsonb)
        ) with ordinality
      loop
        insert into public.expense_item_addons (
          expense_item_id,
          name,
          amount,
          quantity,
          sort_order
        )
        values (
          v_item_id,
          trim(v_sub_item ->> 'name'),
          coalesce(
            nullif(v_sub_item ->> 'amount', ''),
            '0'
          )::numeric,
          coalesce(
            nullif(v_sub_item ->> 'quantity', ''),
            '1'
          )::integer,
          v_sub_index
        );
      end loop;
    end loop;
  end if;

  return v_expense_id;
end;
$$;

revoke all
on function public.create_expense(
  uuid,
  text,
  date,
  uuid,
  public.split_method,
  numeric,
  jsonb,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.create_expense(
  uuid,
  text,
  date,
  uuid,
  public.split_method,
  numeric,
  jsonb,
  jsonb,
  jsonb
)
to authenticated;
