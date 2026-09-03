-- =========================================================
-- FIX FORMER MEMBER HISTORICAL VISIBILITY
-- =========================================================
--
-- Problem:
--
-- After a member leaves a group:
--
-- ✓ Home recent activity can still see historical
--   Expenses / IOUs.
--
-- ✗ Expenses overview may hide them.
-- ✗ IOUs overview may hide them.
-- ✗ Historical participant names may become unavailable.
--
-- Cause:
--
-- Transaction-level history is visible, but people RLS
-- only considers current group relationships.
--
-- Fix:
--
-- 1. Permit people visibility when that person appears in
--    a transaction the current user may historically view.
--
-- 2. Make overview RPCs SECURITY DEFINER, but explicitly
--    authorize every returned transaction through:
--
--      private.can_view_expense()
--      private.can_view_iou()
--
-- Therefore SECURITY DEFINER does not broaden access.
-- =========================================================


-- =========================================================
-- 1. CAN CURRENT USER SEE THIS PERSON?
-- =========================================================

create or replace function
private.can_view_person(
  p_person_id uuid
)
returns boolean

language sql
stable
security definer
set search_path = ''

as $$

  select exists (

    select 1

    from public.people p

    where p.id =
      p_person_id

      and (

        -- -----------------------------------------------
        -- Myself
        -- -----------------------------------------------

        p.linked_user_id =
          (select auth.uid())


        -- -----------------------------------------------
        -- My local contact
        -- -----------------------------------------------

        or (

          p.owner_id =
            (select auth.uid())

          and p.linked_user_id
            is null

        )


        -- -----------------------------------------------
        -- Active shared group
        -- -----------------------------------------------

        or exists (

          select 1

          from public.group_members gm

          where gm.person_id =
              p.id

            and gm.membership_status =
              'active'

            and private.is_group_member(
              gm.group_id
            )

        )


        -- -----------------------------------------------
        -- Historical Expense relationship
        --
        -- Person either paid or participated in an Expense
        -- that the current user is still allowed to view.
        -- -----------------------------------------------

        or exists (

          select 1

          from public.expenses e

          where private.can_view_expense(
              e.id
            )

            and (

              e.paid_by =
                p.id

              or exists (

                select 1

                from public.expense_participants ep

                where ep.expense_id =
                    e.id

                  and ep.person_id =
                    p.id

              )

            )

        )


        -- -----------------------------------------------
        -- Historical IOU relationship
        -- -----------------------------------------------

        or exists (

          select 1

          from public.ious i

          where private.can_view_iou(
              i.id
            )

            and p.id
              in (
                i.from_person_id,
                i.to_person_id
              )

        )

      )

  );

$$;


revoke all
on function
private.can_view_person(uuid)
from public;


grant execute
on function
private.can_view_person(uuid)
to authenticated;


-- =========================================================
-- 2. REPLACE PEOPLE SELECT POLICY
-- =========================================================

drop policy if exists
people_select
on public.people;


create policy people_select

on public.people

for select

to authenticated

using (

  private.can_view_person(
    id
  )

);


-- =========================================================
-- 3. EXPENSES OVERVIEW
--
-- SECURITY DEFINER is intentional here.
--
-- Every row still MUST pass:
--
-- private.can_view_expense(e.id)
--
-- This lets us read the historical payer/participant names
-- without depending on current group membership.
-- =========================================================

create or replace function
public.get_expenses_overview()
returns table (

  expense_id uuid,

  name text,

  expense_date date,

  total_amount numeric,

  paid_by_name text,

  status text,

  unpaid_count bigint,

  created_at timestamptz

)

language sql
stable
security definer
set search_path = ''

as $$

with


-- =========================================================
-- CURRENT PERSON
-- =========================================================

self_person as (

  select p.id

  from public.people p

  where p.linked_user_id =
    (select auth.uid())

  limit 1

),


-- =========================================================
-- OUTSTANDING SHARE PER PARTICIPANT
-- =========================================================

participant_outstanding as (

  select

    e.id
      as expense_id,

    ep.person_id,

    greatest(

      ep.share_amount

      -

      coalesce(
        (

          select
            sum(pay.amount)

          from public.expense_payments pay

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


  where ep.person_id <>
    e.paid_by

)


select

  e.id
    as expense_id,

  e.name,

  e.expense_date,

  e.total_amount,


  case

    when payer.linked_user_id =
         (select auth.uid())

    then 'You'

    else payer.name

  end
    as paid_by_name,


  case


    -- -----------------------------------------------------
    -- I paid and somebody still owes me.
    -- -----------------------------------------------------

    when e.paid_by =
         sp.id

      and exists (

        select 1

        from participant_outstanding po

        where po.expense_id =
            e.id

          and po.outstanding >
            0

          and po.person_id <>
            sp.id

      )

    then 'owed-to-me'


    -- -----------------------------------------------------
    -- I paid and everybody settled.
    -- -----------------------------------------------------

    when e.paid_by =
         sp.id

    then 'settled'


    -- -----------------------------------------------------
    -- I participated and still owe payer.
    -- -----------------------------------------------------

    when exists (

      select 1

      from participant_outstanding po

      where po.expense_id =
          e.id

        and po.person_id =
          sp.id

        and po.outstanding >
          0

    )

    then 'i-owe'


    -- -----------------------------------------------------
    -- I participated and my share is settled.
    -- -----------------------------------------------------

    when exists (

      select 1

      from public.expense_participants ep

      where ep.expense_id =
          e.id

        and ep.person_id =
          sp.id

    )

    then 'settled'


    -- -----------------------------------------------------
    -- Current group owner sees group transactions they
    -- don't personally participate in.
    -- -----------------------------------------------------

    else 'group'

  end
    as status,


  case

    when e.paid_by =
         sp.id

    then (

      select
        count(*)

      from participant_outstanding po

      where po.expense_id =
          e.id

        and po.outstanding >
          0

        and po.person_id <>
          sp.id

    )

    else 0

  end
    as unpaid_count,


  e.created_at


from public.expenses e


cross join self_person sp


join public.people payer

  on payer.id =
    e.paid_by


where private.can_view_expense(
  e.id
)


order by

  e.expense_date desc,

  e.created_at desc;

$$;


revoke all
on function
public.get_expenses_overview()
from public;


grant execute
on function
public.get_expenses_overview()
to authenticated;


-- =========================================================
-- 4. IOU OVERVIEW
-- =========================================================

create or replace function
public.get_ious_overview()
returns table (

  iou_id uuid,

  reason text,

  iou_date date,

  original_amount numeric,

  outstanding_amount numeric,

  from_name text,

  to_name text,

  status text,

  created_at timestamptz

)

language sql
stable
security definer
set search_path = ''

as $$

with


-- =========================================================
-- CURRENT PERSON
-- =========================================================

self_person as (

  select p.id

  from public.people p

  where p.linked_user_id =
    (select auth.uid())

  limit 1

),


-- =========================================================
-- IOU BALANCES
-- =========================================================

iou_balances as (

  select

    i.id,

    i.reason,

    i.iou_date,

    i.amount,

    i.from_person_id,

    i.to_person_id,

    i.created_at,


    greatest(

      i.amount

      -

      coalesce(
        (

          select
            sum(pay.amount)

          from public.iou_payments pay

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

  where private.can_view_iou(
    i.id
  )

)


select

  ib.id
    as iou_id,

  ib.reason,

  ib.iou_date,

  ib.amount
    as original_amount,

  ib.outstanding
    as outstanding_amount,


  case

    when from_person.linked_user_id =
         (select auth.uid())

    then 'You'

    else from_person.name

  end
    as from_name,


  case

    when to_person.linked_user_id =
         (select auth.uid())

    then 'You'

    else to_person.name

  end
    as to_name,


  case


    -- -----------------------------------------------------
    -- Someone owes me.
    -- -----------------------------------------------------

    when ib.to_person_id =
         sp.id

      and ib.outstanding >
        0

    then 'owed-to-me'


    -- -----------------------------------------------------
    -- I owe somebody.
    -- -----------------------------------------------------

    when ib.from_person_id =
         sp.id

      and ib.outstanding >
        0

    then 'i-owe'


    -- -----------------------------------------------------
    -- Historical IOU involving me, fully settled.
    -- -----------------------------------------------------

    when sp.id
      in (
        ib.from_person_id,
        ib.to_person_id
      )

      and ib.outstanding =
        0

    then 'settled'


    -- -----------------------------------------------------
    -- Group owner viewing transaction between other people.
    -- -----------------------------------------------------

    else 'group'

  end
    as status,


  ib.created_at


from iou_balances ib


cross join self_person sp


join public.people from_person

  on from_person.id =
    ib.from_person_id


join public.people to_person

  on to_person.id =
    ib.to_person_id


order by

  ib.iou_date desc,

  ib.created_at desc;

$$;


revoke all
on function
public.get_ious_overview()
from public;


grant execute
on function
public.get_ious_overview()
to authenticated;