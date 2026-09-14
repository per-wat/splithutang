-- Cover recurring-payment foreign keys used by cascades and relationship lookups.

create index if not exists recurring_arrangements_owner
  on public.recurring_arrangements(owner_id);

create index if not exists recurring_versions_created_by
  on public.recurring_arrangement_versions(created_by_user_id);

create index if not exists recurring_periods_version
  on public.recurring_periods(version_id);

create index if not exists recurring_payments_from_person
  on public.recurring_payments(from_person_id);

create index if not exists recurring_payments_submitted_by
  on public.recurring_payments(submitted_by_user_id)
  where submitted_by_user_id is not null;

create index if not exists recurring_payments_resolved_by
  on public.recurring_payments(resolved_by_user_id)
  where resolved_by_user_id is not null;
