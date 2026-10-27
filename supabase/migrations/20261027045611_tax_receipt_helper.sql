-- Tax receipt metadata and originals are server-mediated. Browser roles cannot
-- bypass feature revocation, even for their own records. Every server operation
-- independently checks tax_receipts access and scopes queries to its session UID.
create function private.valid_tax_receipt_items(items jsonb, total integer)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare item jsonb; subtotal bigint := 0;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 20 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['kind','description','amountCents','beneficiary','conditionMet','parentResident'])
      or (item->>'kind') not in ('unsure','books','device','internet','course','sports_equipment','sports_facility','sports_competition','sports_training','other')
      or jsonb_typeof(item->'description') <> 'string' or length(item->>'description') > 160
      or (item->>'beneficiary') not in ('self','spouse','child','parent','other','unsure')
      or (item->>'conditionMet') not in ('yes','no','unsure')
      or (item->>'parentResident') not in ('yes','no','unsure')
      or jsonb_typeof(item->'amountCents') <> 'number' or (item->>'amountCents') !~ '^[0-9]{1,9}$'
      then return false; end if;
    if (item->>'kind') is null or (item->>'beneficiary') is null or (item->>'conditionMet') is null or (item->>'parentResident') is null then return false; end if;
    subtotal := subtotal + (item->>'amountCents')::bigint;
    if subtotal > total then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.valid_tax_receipt_items(jsonb, integer) from public, anon, authenticated;
grant execute on function private.valid_tax_receipt_items(jsonb, integer) to service_role;

create table public.tax_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  merchant text not null check (length(trim(merchant)) between 1 and 120),
  purchase_date date not null check (purchase_date >= date '2000-01-01'),
  assessment_year integer generated always as (extract(year from purchase_date)::integer) stored,
  total_cents integer not null check (total_cents between 1 and 100000000),
  items jsonb not null check (private.valid_tax_receipt_items(items, total_cents)),
  answers jsonb not null check (
    jsonb_typeof(answers) = 'object'
    and answers ?& array['resident','ownExpense','claimOnce']
    and coalesce(answers->>'resident','') in ('yes','no','unsure')
    and coalesce(answers->>'ownExpense','') in ('yes','no','unsure')
    and coalesce(answers->>'claimOnce','') in ('yes','no','unsure')
  ),
  rules_version text not null check (rules_version = 'unreviewed' or (assessment_year in (2025,2026) and rules_version = assessment_year::text || '.1')),
  notes text not null default '' check (length(notes) <= 1000),
  file_path text not null unique check (file_path like user_id::text || '/' || id::text || '/receipt.%'),
  file_mime text not null check (file_mime in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size integer not null check (file_size between 1 and 3145728),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  revision integer not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, file_sha256)
);
create index tax_receipts_user_year_date on public.tax_receipts (user_id, assessment_year, purchase_date, id);
alter table public.tax_receipts enable row level security;
revoke all on public.tax_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.tax_receipts to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tax-receipts', 'tax-receipts', false, 3145728, array['image/jpeg','image/png','image/webp','application/pdf']);
-- Deny direct browser operations for this bucket even if a broad permissive
-- policy is added later for other buckets. It does not affect other storage.
create policy tax_receipts_server_only on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'tax-receipts') with check (bucket_id <> 'tax-receipts');
