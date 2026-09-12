-- Use the same plain-language wording in notifications as the app UI.
-- Internal notification types and resource names remain unchanged.

create or replace function private.create_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_group_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_metadata jsonb,
  p_deduplication_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
  v_metadata jsonb;
  v_title text := p_title;
  v_body text := p_body;
  v_actor_name text;
  v_group_name text;
  v_resource_name text;
  v_amount text;
begin
  if p_recipient_user_id is null
     or p_recipient_user_id is not distinct from p_actor_user_id then
    return;
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb)
    || private.notification_actor_snapshot(p_actor_user_id);
  v_actor_name := coalesce(v_metadata ->> 'actor_name', 'Someone');
  v_group_name := coalesce(v_metadata ->> 'group_name', 'a group');
  v_resource_name := coalesce(
    v_metadata ->> 'iou_reason',
    v_metadata ->> 'expense_name',
    'this item'
  );
  v_amount := case
    when nullif(v_metadata ->> 'amount', '') is null then '0.00'
    else to_char((v_metadata ->> 'amount')::numeric, 'FM999999990.00')
  end;

  case p_notification_type
    when 'iou_created' then
      v_title := format('%s added Hutang in %s.', v_actor_name, v_group_name);
      v_body := format('%s · RM %s', v_resource_name, v_amount);
    when 'iou_updated' then
      v_title := format('%s updated %s.', v_actor_name, v_resource_name);
      v_body := format('Hutang details changed in %s.', v_group_name);
    when 'iou_deleted' then
      v_title := format('%s deleted %s.', v_actor_name, v_resource_name);
      v_body := format('The Hutang was removed from %s.', v_group_name);
    when 'iou_payment_submitted' then
      v_title := format('%s marked RM %s as paid.', v_actor_name, v_amount);
      v_body := format(
        '%s is waiting for your confirmation.',
        v_resource_name
      );
    when 'iou_payment_recorded' then
      v_title := format('%s recorded a payment of RM %s.', v_actor_name, v_amount);
      v_body := format('%s has been updated.', v_resource_name);
    when 'iou_payment_confirmed' then
      v_title := format('%s confirmed receiving RM %s.', v_actor_name, v_amount);
      v_body := format('%s has been updated.', v_resource_name);
    when 'iou_payment_rejected' then
      v_title := format('%s marked RM %s as not received.', v_actor_name, v_amount);
      v_body := format('The payment for %s was not confirmed.', v_resource_name);
    when 'iou_settled' then
      v_title := format('%s is fully paid.', v_resource_name);
      v_body := 'No more payment is needed.';
    when 'expense_payment_submitted' then
      v_title := format('%s marked RM %s as paid.', v_actor_name, v_amount);
      v_body := format(
        '%s is waiting for your confirmation.',
        v_resource_name
      );
    when 'expense_payment_recorded' then
      v_title := format('%s recorded a payment of RM %s.', v_actor_name, v_amount);
      v_body := format('%s has been updated.', v_resource_name);
    when 'expense_payment_confirmed' then
      v_title := format('%s confirmed receiving RM %s.', v_actor_name, v_amount);
      v_body := format('%s has been updated.', v_resource_name);
    when 'expense_payment_rejected' then
      v_title := format('%s marked RM %s as not received.', v_actor_name, v_amount);
      v_body := format('The payment for %s was not confirmed.', v_resource_name);
    when 'expense_settled' then
      v_title := format('%s is fully paid.', v_resource_name);
      v_body := format('Everyone''s share in %s is fully paid.', v_group_name);
    else
      null;
  end case;

  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    notification_type,
    title,
    body,
    group_id,
    resource_type,
    resource_id,
    metadata,
    deduplication_key
  ) values (
    p_recipient_user_id,
    p_actor_user_id,
    p_notification_type,
    v_title,
    v_body,
    p_group_id,
    p_resource_type,
    p_resource_id,
    v_metadata,
    p_deduplication_key
  )
  on conflict (recipient_user_id, deduplication_key)
    where deduplication_key is not null
  do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    insert into public.notification_push_outbox (notification_id)
    values (v_notification_id)
    on conflict (notification_id) do nothing;
  end if;
end;
$$;
