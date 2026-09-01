create or replace function public.record_expense_payment(
  p_expense_id uuid,
  p_from_person_id uuid,
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
  v_paid_by uuid;

  v_self_person_id uuid;

  v_share_amount numeric;
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
   * Resolve the expense.
   */
  select
    e.group_id,
    e.paid_by,
    g.owner_id
  into
    v_group_id,
    v_paid_by,
    v_group_owner_id
  from public.expenses e
  join public.groups g
    on g.id = e.group_id
  where e.id = p_expense_id;

  if v_group_id is null then
    raise exception 'Expense not found';
  end if;

  /*
   * The payer doesn't owe themselves.
   */
  if p_from_person_id = v_paid_by then
    raise exception 'The expense payer does not owe themselves';
  end if;

  /*
   * The debtor must actually be a participant.
   */
  select ep.share_amount
  into v_share_amount
  from public.expense_participants ep
  where ep.expense_id = p_expense_id
    and ep.person_id = p_from_person_id;

  if v_share_amount is null then
    raise exception 'Person is not a participant in this expense';
  end if;

  /*
   * For regular group members, resolve which person
   * represents the authenticated user.
   *
   * Group owner is allowed to record payments for
   * any participant.
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
     * A normal member can record:
     *
     * 1. Their own payment to the payer.
     * 2. An incoming payment if they are the payer.
     */
    if v_self_person_id <> p_from_person_id
       and v_self_person_id <> v_paid_by then
      raise exception
        'You cannot record a payment for this person';
    end if;
  end if;

  /*
   * Work out how much has already been paid.
   */
  select coalesce(sum(ep.amount), 0)
  into v_paid_amount
  from public.expense_payments ep
  where ep.expense_id = p_expense_id
    and ep.from_person_id = p_from_person_id
    and ep.to_person_id = v_paid_by;

  v_remaining :=
    greatest(
      v_share_amount - v_paid_amount,
      0
    );

  if v_remaining <= 0 then
    raise exception 'This share is already settled';
  end if;

  /*
   * Prevent over-payment.
   */
  if p_amount > v_remaining then
    raise exception
      'Payment cannot exceed the remaining amount of RM %',
      to_char(v_remaining, 'FM999999990.00');
  end if;

  insert into public.expense_payments (
    expense_id,
    from_person_id,
    to_person_id,
    amount,
    note
  )
  values (
    p_expense_id,
    p_from_person_id,
    v_paid_by,
    p_amount,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id
  into v_payment_id;

  return v_payment_id;
end;
$$;


/*
 * Payments should now be created through the RPC,
 * not direct client-side inserts.
 */
revoke insert, update, delete
on public.expense_payments
from authenticated;

drop policy if exists expense_payments_insert
on public.expense_payments;

drop policy if exists expense_payments_update
on public.expense_payments;

drop policy if exists expense_payments_delete
on public.expense_payments;


revoke all
on function public.record_expense_payment(
  uuid,
  uuid,
  numeric,
  text
)
from public;

grant execute
on function public.record_expense_payment(
  uuid,
  uuid,
  numeric,
  text
)
to authenticated;