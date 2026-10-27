-- Disposable/test database only, after migrations. Everything rolls back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('94000000-0000-4000-8000-000000000001','tax-a@example.test','{"display_name":"Tax A"}'),
('94000000-0000-4000-8000-000000000002','tax-b@example.test','{"display_name":"Tax B"}');
insert into public.profiles(id,display_name) values
('94000000-0000-4000-8000-000000000001','Tax A'),
('94000000-0000-4000-8000-000000000002','Tax B') on conflict(id) do nothing;
insert into public.tax_receipts(id,user_id,merchant,purchase_date,total_cents,items,answers,rules_version,file_path,file_mime,file_size,file_sha256)
values ('95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Fixture','2025-02-01',10000,
'[{"kind":"books","description":"Fixture","amountCents":5000,"beneficiary":"self","conditionMet":"yes","parentResident":"unsure"}]',
'{"resident":"yes","ownExpense":"yes","claimOnce":"yes"}', '2025.1',
'94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/receipt.png','image/png',9,repeat('a',64));
do $$ begin
  if (select assessment_year from public.tax_receipts where id='95000000-0000-4000-8000-000000000001') <> 2025 then raise exception 'Assessment year must derive from payment date'; end if;
  if private.valid_tax_receipt_items('[{"kind":"books","description":"Fixture","amountCents":10001,"beneficiary":"self","conditionMet":"yes","parentResident":"unsure"}]',10000) then raise exception 'Over-allocation accepted'; end if;
  if private.valid_tax_receipt_items('[{"kind":null,"description":"Fixture","amountCents":100,"beneficiary":"self","conditionMet":"yes","parentResident":"unsure"}]',10000) then raise exception 'Null kind accepted'; end if;
  begin update public.tax_receipts set total_cents=4000 where id='95000000-0000-4000-8000-000000000001'; raise exception 'Invalid total accepted'; exception when check_violation then null; end;
  begin update public.tax_receipts set rules_version='2026.1' where id='95000000-0000-4000-8000-000000000001'; raise exception 'Wrong-year rules accepted'; exception when check_violation then null; end;
  if not (select relrowsecurity from pg_class where oid='public.tax_receipts'::regclass) then raise exception 'RLS disabled'; end if;
  if (select public from storage.buckets where id='tax-receipts') then raise exception 'Receipt bucket is public'; end if;
end $$;

-- Prove that even an accidental future permissive policy cannot expose files.
create policy tax_receipt_test_broad_policy on storage.objects for all to authenticated using(true) with check(true);
insert into storage.objects(bucket_id,name) values
('tax-receipts','94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/receipt.png');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin perform * from public.tax_receipts; raise exception 'Direct browser metadata read succeeded'; exception when insufficient_privilege then null; end;
  begin update public.tax_receipts set total_cents=100; raise exception 'Direct browser update succeeded'; exception when insufficient_privilege then null; end;
  begin delete from public.tax_receipts; raise exception 'Direct browser delete succeeded'; exception when insufficient_privilege then null; end;
  if exists(select 1 from storage.objects where bucket_id='tax-receipts') then raise exception 'Direct storage download policy exposes receipts'; end if;
  begin insert into storage.objects(bucket_id,name) values('tax-receipts','94000000-0000-4000-8000-000000000001/fake.png'); raise exception 'Direct upload succeeded'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='tax-receipts') then raise exception 'Another user sees receipts'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.tax_receipts; raise exception 'Anonymous read succeeded'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ begin
  if (select count(*) from public.tax_receipts where user_id='94000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Server access failed'; end if;
end $$;
rollback;
