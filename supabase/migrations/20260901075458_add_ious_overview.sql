create or replace function public.get_ious_overview()
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
security invoker
set search_path = ''
as $$
  with self_people as (
    select p.id
    from public.people p
    where p.linked_user_id = (select auth.uid())
  ),

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
        i.amount -
        coalesce(
          (
            select sum(pay.amount)
            from public.iou_payments pay
            where pay.iou_id = i.id
              and pay.from_person_id = i.from_person_id
              and pay.to_person_id = i.to_person_id
          ),
          0
        ),
        0
      ) as outstanding

    from public.ious i
  )

  select
    ib.id as iou_id,
    ib.reason,
    ib.iou_date,
    ib.amount as original_amount,
    ib.outstanding as outstanding_amount,

    from_person.name as from_name,
    to_person.name as to_name,

    case

      -- Someone owes the current user.
      when exists (
        select 1
        from self_people sp
        where sp.id = ib.to_person_id
      )
      and ib.outstanding > 0
      then 'owed-to-me'

      -- Current user owes someone.
      when exists (
        select 1
        from self_people sp
        where sp.id = ib.from_person_id
      )
      and ib.outstanding > 0
      then 'i-owe'

      -- Current user is involved and the IOU is fully repaid.
      when exists (
        select 1
        from self_people sp
        where sp.id = ib.from_person_id
           or sp.id = ib.to_person_id
      )
      and ib.outstanding = 0
      then 'settled'

      -- Group owner can see an IOU they do not personally participate in.
      else 'group'

    end as status,

    ib.created_at

  from iou_balances ib

  join public.people from_person
    on from_person.id = ib.from_person_id

  join public.people to_person
    on to_person.id = ib.to_person_id

  order by ib.iou_date desc, ib.created_at desc;
$$;

revoke all
on function public.get_ious_overview()
from public;

grant execute
on function public.get_ious_overview()
to authenticated;