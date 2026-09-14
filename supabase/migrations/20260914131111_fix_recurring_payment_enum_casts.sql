-- PostgreSQL resolves CASE expressions made only from string literals as text.
-- Cast every branch assigned to a recurring enum so payment, review, and
-- skip/unskip updates cannot fail with an enum-versus-text type mismatch.

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
    payment_status = case
      when v_status = 'confirmed' then 'paid'::public.recurring_obligation_status
      else 'pending'::public.recurring_obligation_status
    end
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
    payment_status = case
      when v_decision = 'confirmed' then 'paid'::public.recurring_obligation_status
      else 'unpaid'::public.recurring_obligation_status
    end
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
    state = case
      when p_skipped then 'skipped'::public.recurring_period_state
      else 'open'::public.recurring_period_state
    end,
    skip_reason = case when p_skipped then nullif(trim(coalesce(p_reason, '')), '') else null end
  where id = p_period_id;

  update public.recurring_obligations set
    payment_status = case
      when p_skipped then 'skipped'::public.recurring_obligation_status
      else 'unpaid'::public.recurring_obligation_status
    end
  where period_id = p_period_id;
end;
$$;

revoke all on function public.set_recurring_period_skipped(uuid, boolean, text) from public, anon;
grant execute on function public.set_recurring_period_skipped(uuid, boolean, text) to authenticated;
