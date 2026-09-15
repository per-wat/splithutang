-- Dismissal is an account preference only. Real setup and learning progress
-- remain derived from browser state and financial activity.

alter table public.profiles
add column if not exists onboarding_dismissed_at timestamptz;

comment on column public.profiles.onboarding_dismissed_at is
  'When set, hides the optional Getting Started prompt until the user restarts it.';
