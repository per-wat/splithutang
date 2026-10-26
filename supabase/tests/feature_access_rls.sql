-- Run against a disposable/test database after migrations. No pgTAP required.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('93000000-0000-4000-8000-000000000001', 'feature-owner@example.test', '{"display_name":"Feature Owner"}'),
  ('93000000-0000-4000-8000-000000000002', 'feature-member@example.test', '{"display_name":"Feature Member"}'),
  ('93000000-0000-4000-8000-000000000003', 'feature-new@example.test', '{"display_name":"Feature New"}');
insert into public.profiles (id, display_name)
values
  ('93000000-0000-4000-8000-000000000001', 'Feature Owner'),
  ('93000000-0000-4000-8000-000000000002', 'Feature Member'),
  ('93000000-0000-4000-8000-000000000003', 'Feature New')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_feature_access (user_id, feature_key, enabled)
values
  ('93000000-0000-4000-8000-000000000001', 'tax_receipts', true),
  ('93000000-0000-4000-8000-000000000002', 'tax_receipts', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists(select 1 from public.user_feature_access) then
    raise exception 'New user should see no grants';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000002', true);
do $$ begin
  if (select count(*) from public.user_feature_access) <> 1 then
    raise exception 'User must see only their own grant';
  end if;
  if exists(select 1 from public.user_feature_access where enabled) then
    raise exception 'Disabled grant must not authorize use';
  end if;
  begin
    insert into public.user_feature_access (user_id, feature_key, enabled)
    values ('93000000-0000-4000-8000-000000000003', 'tax_receipts', true);
    raise exception 'Authenticated insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.user_feature_access set enabled = true;
    raise exception 'Self-grant unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.user_feature_access;
    raise exception 'Authenticated delete unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.search_feature_access_users('', 0, 21);
    raise exception 'Authenticated email lookup unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.search_feature_access_users('', 0, 21);
    raise exception 'Authenticated private lookup unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin
    perform * from public.user_feature_access;
    raise exception 'Anonymous grant lookup unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.search_feature_access_users('', 0, 21);
    raise exception 'Anonymous user lookup unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;

set local role service_role;
do $$ begin
  if (select count(*) from public.search_feature_access_users('feature-member@example.test', 0, 21)) <> 1 then
    raise exception 'Service email search failed';
  end if;
  if (select count(*) from public.search_feature_access_users('Feature Member', 0, 21)) <> 1 then
    raise exception 'Service name search failed';
  end if;
  if exists(select 1 from public.search_feature_access_users('%', 0, 21)) then
    raise exception 'Wildcard must be treated literally';
  end if;
  if exists(select 1 from public.search_feature_access_users('feature-member@example.test', 1, 21)) then
    raise exception 'Search offset failed';
  end if;
  begin
    insert into public.user_feature_access (user_id, feature_key)
    values ('93000000-0000-4000-8000-000000000003', 'unknown_feature');
    raise exception 'Unknown feature unexpectedly accepted';
  exception when check_violation then null; end;
end $$;

update public.user_feature_access set enabled = true
where user_id = '93000000-0000-4000-8000-000000000002';
set local role authenticated;
-- Same identity and transaction: grants need no JWT refresh.
do $$ begin
  if (select count(*) from public.user_feature_access where enabled) <> 1 then
    raise exception 'Grant should take effect immediately';
  end if;
end $$;

set local role service_role;
update public.user_feature_access set enabled = false
where user_id = '93000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  if exists(select 1 from public.user_feature_access where enabled) then
    raise exception 'Revocation should take effect immediately';
  end if;
  if (select count(*) from public.user_feature_access) <> 1 then
    raise exception 'Revocation must preserve the grant record';
  end if;
end $$;

rollback;
