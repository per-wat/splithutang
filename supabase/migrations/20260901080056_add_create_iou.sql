create or replace function public.create_iou(
  p_group_id uuid,
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_amount numeric,
  p_reason text,
  p_iou_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_group_owner_id uuid;
  v_self_person_id uuid;
  v_iou_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if p_group_id is null then
    raise exception 'A group is required';
  end if;

  if p_from_person_id is null or p_to_person_id is null then
    raise exception 'Both people are required';
  end if;

  if p_from_person_id = p_to_person_id then
    raise exception 'A person cannot owe themselves';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Reason is required';
  end if;

  if p_iou_date is null then
    raise exception 'Date is required';
  end if;

  select g.owner_id
  into v_group_owner_id
  from public.groups g
  where g.id = p_group_id;

  if v_group_owner_id is null then
    raise exception 'Group not found';
  end if;

  -- Both people must belong to the selected group.
  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.person_id = p_from_person_id
  ) then
    raise exception 'Debtor is not a member of this group';
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.person_id = p_to_person_id
  ) then
    raise exception 'Recipient is not a member of this group';
  end if;

  /*
   * If the caller is not the group owner,
   * find their linked person inside this group.
   */
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

    -- Regular members may only create IOUs involving themselves.
    if p_from_person_id <> v_self_person_id
       and p_to_person_id <> v_self_person_id then
      raise exception 'You can only create IOUs that involve you';
    end if;
  end if;

  insert into public.ious (
    owner_id,
    group_id,
    from_person_id,
    to_person_id,
    amount,
    reason,
    iou_date
  )
  values (
    v_user_id,
    p_group_id,
    p_from_person_id,
    p_to_person_id,
    p_amount,
    trim(p_reason),
    p_iou_date
  )
  returning id into v_iou_id;

  return v_iou_id;
end;
$$;

revoke all
on function public.create_iou(uuid, uuid, uuid, numeric, text, date)
from public;

grant execute
on function public.create_iou(uuid, uuid, uuid, numeric, text, date)
to authenticated;