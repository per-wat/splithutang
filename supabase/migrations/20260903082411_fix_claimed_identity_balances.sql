-- =========================================================
-- FIX CLAIMED IDENTITY BALANCES
--
-- Problem:
--
-- After a local contact is claimed by a real Auth account,
-- historical Expenses and IOUs are correctly transferred,
-- but get_people_balances() may return RM0 because its
-- calculation depended on SECURITY INVOKER / RLS visibility
-- of historical rows.
--
-- New rule:
--
-- Balance calculation is based explicitly on:
--
--   auth.uid()
--       ↓
--   canonical people.id
--       ↓
--   actual expense / IOU participation
--
-- Transaction creator/owner does NOT determine whether a
-- debt belongs to the current user.
-- =========================================================


create or replace function
public.get_people_balances()
returns table (

  person_id uuid,

  name text,

  avatar_color text,

  balance numeric

)
language sql
stable
security definer
set search_path = ''
as $$

with


-- =========================================================
-- 1. CURRENT CANONICAL PERSON
-- =========================================================

self_person as (

  select
    p.id

  from public.people p

  where p.linked_user_id =
    (select auth.uid())

  limit 1

),


-- =========================================================
-- 2. GROUPS CURRENT USER CAN ACTUALLY ACCESS
--
-- Include:
--
-- - groups owned by current Auth user
-- - groups containing current canonical person
-- =========================================================

my_groups as (

  select
    g.id

  from public.groups g

  where g.owner_id =
    (select auth.uid())


  union


  select
    gm.group_id

  from public.group_members gm

  join self_person sp
    on sp.id =
      gm.person_id

),


-- =========================================================
-- 3. PEOPLE CURRENT USER MAY SEE
--
-- Include:
--
-- - own unlinked/local contacts
-- - everybody belonging to one of my groups
--
-- Exclude myself.
-- =========================================================

visible_person_ids as (

  select
    p.id

  from public.people p

  where

    (
      p.owner_id =
        (select auth.uid())

      and

      p.linked_user_id
        is null
    )


  union


  select
    gm.person_id

  from public.group_members gm

  where gm.group_id
    in (
      select id
      from my_groups
    )

),


visible_people as (

  select

    p.id,

    p.name,

    p.avatar_color

  from public.people p

  where p.id
    in (
      select id
      from visible_person_ids
    )

    and not exists (

      select 1

      from self_person sp

      where sp.id =
        p.id

    )

),


-- =========================================================
-- 4. EXPENSE DEBT
--
-- Every non-payer participant owes:
--
-- share_amount
--   -
-- confirmed payments
--
-- Pending/rejected payments do NOT reduce debt.
-- =========================================================

expense_debts as (

  select

    ep.person_id
      as debtor_id,

    e.paid_by
      as creditor_id,


    greatest(

      ep.share_amount

      -

      coalesce(
        (

          select
            sum(pay.amount)

          from
            public.expense_payments pay

          where pay.expense_id =
              e.id

            and pay.from_person_id =
              ep.person_id

            and pay.to_person_id =
              e.paid_by

            and pay.status =
              'confirmed'

        ),

        0

      ),

      0

    )::numeric(12,2)
      as outstanding


  from public.expenses e


  join public.expense_participants ep

    on ep.expense_id =
      e.id


  where

    e.group_id
      in (
        select id
        from my_groups
      )

    and

    ep.person_id <>
      e.paid_by

),


-- =========================================================
-- 5. EXPENSE EFFECT ON CURRENT USER
--
-- Positive:
-- somebody owes me.
--
-- Negative:
-- I owe somebody.
-- =========================================================

expense_effects as (


  -- ---------------------------------------------
  -- I paid.
  -- Other participant owes me.
  -- ---------------------------------------------

  select

    ed.debtor_id
      as person_id,

    ed.outstanding
      as delta

  from expense_debts ed

  where exists (

    select 1

    from self_person sp

    where sp.id =
      ed.creditor_id

  )


  union all


  -- ---------------------------------------------
  -- Someone else paid.
  -- I owe that payer.
  -- ---------------------------------------------

  select

    ed.creditor_id
      as person_id,

    -ed.outstanding
      as delta

  from expense_debts ed

  where exists (

    select 1

    from self_person sp

    where sp.id =
      ed.debtor_id

  )

),


-- =========================================================
-- 6. IOU DEBT
--
-- from_person = debtor
-- to_person   = creditor
-- =========================================================

iou_debts as (

  select

    i.from_person_id
      as debtor_id,

    i.to_person_id
      as creditor_id,


    greatest(

      i.amount

      -

      coalesce(
        (

          select
            sum(pay.amount)

          from
            public.iou_payments pay

          where pay.iou_id =
              i.id

            and pay.from_person_id =
              i.from_person_id

            and pay.to_person_id =
              i.to_person_id

            and pay.status =
              'confirmed'

        ),

        0

      ),

      0

    )::numeric(12,2)
      as outstanding


  from public.ious i


  where

    i.group_id
      in (
        select id
        from my_groups
      )

),


-- =========================================================
-- 7. IOU EFFECT ON CURRENT USER
-- =========================================================

iou_effects as (


  -- ---------------------------------------------
  -- Someone owes me.
  -- ---------------------------------------------

  select

    idb.debtor_id
      as person_id,

    idb.outstanding
      as delta

  from iou_debts idb

  where exists (

    select 1

    from self_person sp

    where sp.id =
      idb.creditor_id

  )


  union all


  -- ---------------------------------------------
  -- I owe somebody.
  -- ---------------------------------------------

  select

    idb.creditor_id
      as person_id,

    -idb.outstanding
      as delta

  from iou_debts idb

  where exists (

    select 1

    from self_person sp

    where sp.id =
      idb.debtor_id

  )

),


-- =========================================================
-- 8. COMBINE EVERYTHING
-- =========================================================

all_effects as (

  select *
  from expense_effects


  union all


  select *
  from iou_effects

)


-- =========================================================
-- 9. FINAL BALANCE PER PERSON
--
-- Positive:
--   They owe You
--
-- Negative:
--   You owe Them
--
-- Zero:
--   Settled / no debt
-- =========================================================

select

  vp.id
    as person_id,

  vp.name,

  vp.avatar_color,


  coalesce(
    sum(
      ae.delta
    ),
    0
  )::numeric(12,2)
    as balance


from visible_people vp


left join all_effects ae

  on ae.person_id =
    vp.id


group by

  vp.id,

  vp.name,

  vp.avatar_color


order by
  vp.name;


$$;


-- =========================================================
-- SECURITY
-- =========================================================

revoke all
on function
public.get_people_balances()
from public;


grant execute
on function
public.get_people_balances()
to authenticated;