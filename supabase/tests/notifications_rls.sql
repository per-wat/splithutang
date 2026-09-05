begin;

select plan(1);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '90000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'notification-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Notification A"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '90000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'notification-b@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Notification B"}',
    now(),
    now()
  );

insert into public.notifications (
  id,
  recipient_user_id,
  notification_type,
  title,
  body,
  resource_type,
  deduplication_key
) values
  (
    '91000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    'expense_created',
    'A notification',
    'Visible only to A',
    'expense',
    'rls-a'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000002',
    'expense_created',
    'B notification',
    'Visible only to B',
    'expense',
    'rls-b'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.notifications;
  if visible_count <> 1 then
    raise exception 'RLS isolation failed: user A saw % rows', visible_count;
  end if;

  update public.notifications
  set read_at = now()
  where id = '91000000-0000-4000-8000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Own mark-as-read failed';
  end if;

  update public.notifications
  set read_at = now()
  where id = '91000000-0000-4000-8000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'Another user notification was modified';
  end if;

  begin
    insert into public.notifications (
      recipient_user_id,
      notification_type,
      title,
      body,
      resource_type
    ) values (
      '90000000-0000-4000-8000-000000000002',
      'expense_created',
      'Forged',
      'Forged',
      'expense'
    );
    raise exception 'Authenticated user forged a notification';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.push_subscriptions (
      user_id,
      endpoint,
      p256dh,
      auth
    ) values (
      '90000000-0000-4000-8000-000000000001',
      'https://push.example.test/forged',
      'forged-key',
      'forged-auth'
    );
    raise exception 'Authenticated browser bypassed the subscription API';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

insert into public.notification_preferences (user_id, push_mode)
values ('90000000-0000-4000-8000-000000000001', 'payments_only');

do $$
begin
  begin
    insert into public.notification_preferences (user_id, push_mode)
    values ('90000000-0000-4000-8000-000000000002', 'all_important');
    raise exception 'Authenticated user changed another user preference';
  exception
    when insufficient_privilege or check_violation then null;
  end;
end
$$;

reset role;

do $$
begin
  if (select read_at is null from public.notifications where id = '91000000-0000-4000-8000-000000000001') then
    raise exception 'Own mark-as-read did not persist';
  end if;

  if (select read_at is not null from public.notifications where id = '91000000-0000-4000-8000-000000000002') then
    raise exception 'User A changed user B read state';
  end if;
end
$$;

select pass('notification RLS isolation and read-state updates are enforced');
select * from finish();

rollback;
