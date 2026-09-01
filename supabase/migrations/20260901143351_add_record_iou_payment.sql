create or replace function public.record_iou_payment(
  p_iou_id uuid,
  p_amount numeric,
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
  v_group_owner_id uuid;

  v_from_person_id uuid;
  v_to_person_id uuid;

  v_self_person_id uuid;

  v_iou_amount numeric;
  v_paid_amount numeric;
  v_remaining numeric;

  v_payment_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  /*
   * Load IOU.
   */
  select
    i.group_id,
    i.from_person_id,
    i.to_person_id,
    i.amount,
    g.owner_id
  into
    v_group_id,
    v_from_person_id,
    v_to_person_id,
    v_iou_amount,
    v_group_owner_id
  from public.ious i
  join public.groups g
    on g.id = i.group_id
  where i.id = p_iou_id;

  if v_group_id is null then
    raise exception 'IOU not found';
  end if;

  /*
   * If caller isn't the group owner,
   * determine which person represents them.
   */
  if v_group_owner_id <> v_user_id then
    select p.id
    into v_self_person_id
    from public.people p
    join public.group_members gm
      on gm.person_id = p.id
    where p.linked_user_id = v_user_id
      and gm.group_id = v_group_id
    limit 1;

    if v_self_person_id is null then
      raise exception 'You are not a member of this group';
    end if;

    /*
     * Only the debtor or creditor may record the
     * payment unless the caller owns the group.
     */
    if v_self_person_id <> v_from_person_id
       and v_self_person_id <> v_to_person_id then
      raise exception
        'You cannot record payments for this IOU';
    end if;
  end if;

  /*
   * Calculate remaining amount.
   */
  select coalesce(sum(ip.amount), 0)
  into v_paid_amount
  from public.iou_payments ip
  where ip.iou_id = p_iou_id
    and ip.from_person_id = v_from_person_id
    and ip.to_person_id = v_to_person_id;

  v_remaining :=
    greatest(
      v_iou_amount - v_paid_amount,
      0
    );

  if v_remaining <= 0 then
    raise exception 'This IOU is already settled';
  end if;

  if p_amount > v_remaining then
    raise exception
      'Payment cannot exceed the remaining amount of RM %',
      to_char(v_remaining, 'FM999999990.00');
  end if;

  /*
   * IOU payments always flow debtor → creditor.
   */
  insert into public.iou_payments (
    iou_id,
    from_person_id,
    to_person_id,
    amount,
    note
  )
  values (
    p_iou_id,
    v_from_person_id,
    v_to_person_id,
    p_amount,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id
  into v_payment_id;

  return v_payment_id;
end;
$$;


/*
 * Force client writes through the validated RPC.
 */
revoke insert, update, delete
on public.iou_payments
from authenticated;

drop policy if exists iou_payments_insert
on public.iou_payments;

drop policy if exists iou_payments_update
on public.iou_payments;

drop policy if exists iou_payments_delete
on public.iou_payments;


revoke all
on function public.record_iou_payment(
  uuid,
  numeric,
  text
)
from public;

grant execute
on function public.record_iou_payment(
  uuid,
  numeric,
  text
)
to authenticated;