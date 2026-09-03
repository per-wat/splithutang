-- =========================================================
-- STAGE C — PRODUCTION HARDENING
-- =========================================================


-- ---------------------------------------------------------
-- 1. Transactions are RPC-write-only
-- ---------------------------------------------------------

revoke insert, update, delete
on public.expenses
from authenticated;

revoke insert, update, delete
on public.ious
from authenticated;


/*
 * Reassert Stage A protection as a safety net.
 */
revoke insert, update, delete
on public.expense_participants
from authenticated;

revoke insert, update, delete
on public.expense_items
from authenticated;

revoke insert, update, delete
on public.expense_item_participants
from authenticated;

revoke insert, update, delete
on public.expense_item_addons
from authenticated;

revoke insert, update, delete
on public.expense_payments
from authenticated;

revoke insert, update, delete
on public.iou_payments
from authenticated;


/*
 * Remove old direct-write RLS policies.
 */
drop policy if exists expenses_insert
on public.expenses;

drop policy if exists expenses_update
on public.expenses;

drop policy if exists expenses_delete
on public.expenses;


drop policy if exists ious_insert
on public.ious;

drop policy if exists ious_update
on public.ious;

drop policy if exists ious_delete
on public.ious;


drop policy if exists expense_participants_insert
on public.expense_participants;

drop policy if exists expense_participants_update
on public.expense_participants;

drop policy if exists expense_participants_delete
on public.expense_participants;


drop policy if exists expense_items_insert
on public.expense_items;

drop policy if exists expense_items_update
on public.expense_items;

drop policy if exists expense_items_delete
on public.expense_items;


drop policy if exists expense_item_participants_insert
on public.expense_item_participants;

drop policy if exists expense_item_participants_update
on public.expense_item_participants;

drop policy if exists expense_item_participants_delete
on public.expense_item_participants;


drop policy if exists expense_item_addons_insert
on public.expense_item_addons;

drop policy if exists expense_item_addons_update
on public.expense_item_addons;

drop policy if exists expense_item_addons_delete
on public.expense_item_addons;


drop policy if exists expense_payments_insert
on public.expense_payments;

drop policy if exists expense_payments_update
on public.expense_payments;

drop policy if exists expense_payments_delete
on public.expense_payments;


drop policy if exists iou_payments_insert
on public.iou_payments;

drop policy if exists iou_payments_update
on public.iou_payments;

drop policy if exists iou_payments_delete
on public.iou_payments;


-- ---------------------------------------------------------
-- 2. Reliable updated_at handling
-- ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin

  new.updated_at := now();

  return new;

end;
$$;


drop trigger if exists set_profiles_updated_at
on public.profiles;

create trigger set_profiles_updated_at
before update
on public.profiles
for each row
execute function public.set_updated_at();


drop trigger if exists set_people_updated_at
on public.people;

create trigger set_people_updated_at
before update
on public.people
for each row
execute function public.set_updated_at();


drop trigger if exists set_groups_updated_at
on public.groups;

create trigger set_groups_updated_at
before update
on public.groups
for each row
execute function public.set_updated_at();


drop trigger if exists set_expenses_updated_at
on public.expenses;

create trigger set_expenses_updated_at
before update
on public.expenses
for each row
execute function public.set_updated_at();


drop trigger if exists set_expense_items_updated_at
on public.expense_items;

create trigger set_expense_items_updated_at
before update
on public.expense_items
for each row
execute function public.set_updated_at();


drop trigger if exists set_expense_item_addons_updated_at
on public.expense_item_addons;

create trigger set_expense_item_addons_updated_at
before update
on public.expense_item_addons
for each row
execute function public.set_updated_at();


drop trigger if exists set_ious_updated_at
on public.ious;

create trigger set_ious_updated_at
before update
on public.ious
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------
-- 3. Trigger functions must not be directly callable
-- ---------------------------------------------------------

revoke all
on function public.set_updated_at()
from public, anon, authenticated;


revoke all
on function public.handle_new_user()
from public, anon, authenticated;


revoke all
on function public.normalize_profile_display_name()
from public, anon, authenticated;


revoke all
on function public.sync_profile_identity_name()
from public, anon, authenticated;


revoke all
on function public.validate_expense_group_people()
from public, anon, authenticated;


revoke all
on function public.validate_expense_paid_by()
from public, anon, authenticated;


revoke all
on function public.validate_iou_group_people()
from public, anon, authenticated;


-- ---------------------------------------------------------
-- 4. Pending-payment indexes
-- ---------------------------------------------------------

create index if not exists
idx_expense_payments_pending_receiver
on public.expense_payments (
  to_person_id,
  paid_at desc
)
where status = 'pending';


create index if not exists
idx_iou_payments_pending_receiver
on public.iou_payments (
  to_person_id,
  paid_at desc
)
where status = 'pending';


-- ---------------------------------------------------------
-- 5. Stage B identity sanity check
-- ---------------------------------------------------------

do $$
begin

  if exists (

    select 1

    from public.people p

    where p.linked_user_id
      is not null

      and p.owner_id
        is distinct from
        p.linked_user_id

  ) then

    raise exception
      'Non-canonical linked people rows still exist';

  end if;


  if exists (

    select 1

    from public.profiles pr

    where not exists (

      select 1

      from public.people p

      where p.linked_user_id =
        pr.id

    )

  ) then

    raise exception
      'At least one profile has no canonical people identity';

  end if;

end
$$;