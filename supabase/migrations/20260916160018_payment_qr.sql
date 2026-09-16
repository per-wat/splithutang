-- Let every linked account keep one private payment QR. The path is mirrored
-- onto the canonical people row so payment screens can discover the receiver's
-- QR without exposing another user's profile row.

alter table public.profiles
  add column if not exists payment_qr_path text;

alter table public.people
  add column if not exists payment_qr_path text;

alter table public.profiles
  drop constraint if exists profiles_payment_qr_path_owner;

alter table public.profiles
  add constraint profiles_payment_qr_path_owner
  check (
    payment_qr_path is null
    or split_part(payment_qr_path, '/', 1) = id::text
  );

alter table public.people
  drop constraint if exists people_payment_qr_path_linked_user;

alter table public.people
  add constraint people_payment_qr_path_linked_user
  check (
    payment_qr_path is null
    or (
      linked_user_id is not null
      and split_part(payment_qr_path, '/', 1) = linked_user_id::text
    )
  );


-- Payment QRs are private assets. Owners can always read their own QR. Another
-- account can read it only while that account has an unpaid expense, Hutang or
-- recurring obligation whose receiver is the QR owner.
create or replace function private.can_read_payment_qr(
  p_owner_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as materialized (
    select private.current_person_id() as person_id
  ),
  receiver as materialized (
    select p.id as person_id
    from public.people p
    where p.linked_user_id::text = p_owner_user_id
    limit 1
  )
  select
    (select auth.uid())::text = p_owner_user_id
    or exists (
      select 1
      from viewer me
      cross join receiver payee
      join public.expenses e
        on e.paid_by = payee.person_id
      join public.expense_participants ep
        on ep.expense_id = e.id
       and ep.person_id = me.person_id
      where me.person_id is not null
        and ep.share_amount > coalesce((
          select sum(payment.amount)
          from public.expense_payments payment
          where payment.expense_id = e.id
            and payment.from_person_id = me.person_id
            and payment.to_person_id = payee.person_id
            and payment.status = 'confirmed'
        ), 0)
        and private.can_view_expense(e.id)
    )
    or exists (
      select 1
      from viewer me
      cross join receiver payee
      join public.ious i
        on i.from_person_id = me.person_id
       and i.to_person_id = payee.person_id
      where me.person_id is not null
        and i.amount > coalesce((
          select sum(payment.amount)
          from public.iou_payments payment
          where payment.iou_id = i.id
            and payment.from_person_id = me.person_id
            and payment.to_person_id = payee.person_id
            and payment.status = 'confirmed'
        ), 0)
        and private.can_view_iou(i.id)
    )
    or exists (
      select 1
      from viewer me
      cross join receiver payee
      join public.recurring_obligations obligation
        on obligation.person_id = me.person_id
       and obligation.payer_person_id = payee.person_id
       and obligation.payment_status = 'unpaid'
      join public.recurring_periods period
        on period.id = obligation.period_id
       and period.state = 'open'
      where me.person_id is not null
        and private.can_view_recurring(period.arrangement_id)
    );
$$;

revoke all on function private.can_read_payment_qr(text)
from public, anon, authenticated;

grant execute on function private.can_read_payment_qr(text)
to authenticated;


insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-qrs',
  'payment-qrs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_qr_insert_own_folder on storage.objects;
create policy payment_qr_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists payment_qr_update_own_folder on storage.objects;
create policy payment_qr_update_own_folder
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payment-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'payment-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists payment_qr_delete_own_folder on storage.objects;
create policy payment_qr_delete_own_folder
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payment-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists payment_qr_select_for_payer on storage.objects;
create policy payment_qr_select_for_payer
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-qrs'
  and private.can_read_payment_qr((storage.foldername(name))[1])
);


create or replace function public.update_my_payment_qr(
  p_payment_qr_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if p_payment_qr_path is not null
     and split_part(p_payment_qr_path, '/', 1) <> v_user_id::text then
    raise exception 'Invalid payment QR path';
  end if;

  if p_payment_qr_path is not null
     and not exists (
       select 1
       from storage.objects object
       where object.bucket_id = 'payment-qrs'
         and object.name = p_payment_qr_path
         and object.owner_id = v_user_id::text
     ) then
    raise exception 'Payment QR upload was not found';
  end if;

  update public.profiles
  set payment_qr_path = p_payment_qr_path
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.people
  set payment_qr_path = p_payment_qr_path
  where linked_user_id = v_user_id;
end;
$$;

revoke all on function public.update_my_payment_qr(text)
from public, anon;

grant execute on function public.update_my_payment_qr(text)
to authenticated;


create or replace function public.sync_profile_payment_qr_to_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.people
  set payment_qr_path = new.payment_qr_path
  where linked_user_id = new.id;

  return new;
end;
$$;

drop trigger if exists sync_profile_payment_qr_to_person
on public.profiles;

create trigger sync_profile_payment_qr_to_person
after update of payment_qr_path
on public.profiles
for each row
execute function public.sync_profile_payment_qr_to_person();

revoke all on function public.sync_profile_payment_qr_to_person()
from public, anon, authenticated;

comment on column public.profiles.payment_qr_path is
  'Private Storage path for the account payment QR shown to people who need to pay this user.';

comment on column public.people.payment_qr_path is
  'Mirror of the linked account payment QR path for payment screens.';
