-- One bounded read supplies the action-based Learn the Basics checklist.
-- Progress comes from real financial activity and is never written separately.

create index if not exists idx_expense_payments_onboarding_from
  on public.expense_payments (from_person_id)
  where status in ('pending', 'confirmed');

create index if not exists idx_expense_payments_onboarding_to
  on public.expense_payments (to_person_id)
  where status in ('pending', 'confirmed');

create index if not exists idx_iou_payments_onboarding_from
  on public.iou_payments (from_person_id)
  where status in ('pending', 'confirmed');

create index if not exists idx_iou_payments_onboarding_to
  on public.iou_payments (to_person_id)
  where status in ('pending', 'confirmed');

create or replace function public.get_onboarding_progress()
returns table (
  has_group boolean,
  has_shared_expense boolean,
  has_payment boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with identity as materialized (
    select person.id
    from public.people person
    where person.linked_user_id = (select auth.uid())
  )
  select
    exists (
      select 1
      from public.groups target_group
      where target_group.archived_at is null
        and (
          target_group.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.group_members membership
            join identity
              on identity.id = membership.person_id
            where membership.group_id = target_group.id
              and membership.membership_status = 'active'
          )
        )
    ) as has_group,

    exists (
      select 1
      from public.expenses expense
      where (
        exists (
          select 1
          from identity
          where identity.id = expense.paid_by
        )
        or exists (
          select 1
          from public.expense_participants participant
          join identity
            on identity.id = participant.person_id
          where participant.expense_id = expense.id
        )
      )
      and exists (
        select 1
        from public.expense_participants other_participant
        where other_participant.expense_id = expense.id
          and other_participant.person_id <> expense.paid_by
      )
    ) as has_shared_expense,

    (
      exists (
        select 1
        from public.expense_payments payment
        join identity
          on identity.id in (payment.from_person_id, payment.to_person_id)
        where payment.status in ('pending', 'confirmed')
      )
      or exists (
        select 1
        from public.iou_payments payment
        join identity
          on identity.id in (payment.from_person_id, payment.to_person_id)
        where payment.status in ('pending', 'confirmed')
      )
    ) as has_payment;
$$;

revoke all
on function public.get_onboarding_progress()
from public, anon;

grant execute
on function public.get_onboarding_progress()
to authenticated;
