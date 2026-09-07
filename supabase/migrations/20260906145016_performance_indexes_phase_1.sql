-- =========================================================
-- SPLITHUTANG PERFORMANCE INDEXES — PHASE 1
-- =========================================================
--
-- Supports:
-- - Home recent expense and IOU queries
-- - Expense and IOU overview ordering
-- - Confirmed payment balance calculations
--
-- No RLS or product behaviour changes.
-- =========================================================


-- ---------------------------------------------------------
-- Recent activity
-- ---------------------------------------------------------

create index if not exists
idx_expenses_created_at_desc
on public.expenses (
  created_at desc
);


create index if not exists
idx_ious_created_at_desc
on public.ious (
  created_at desc
);


-- ---------------------------------------------------------
-- Overview page ordering
-- ---------------------------------------------------------

create index if not exists
idx_expenses_overview_order
on public.expenses (
  expense_date desc,
  created_at desc
);


create index if not exists
idx_ious_overview_order
on public.ious (
  iou_date desc,
  created_at desc
);


-- ---------------------------------------------------------
-- Confirmed expense-payment calculations
-- ---------------------------------------------------------

create index if not exists
idx_expense_payments_confirmed_lookup
on public.expense_payments (
  expense_id,
  from_person_id,
  to_person_id
)
include (
  amount
)
where status = 'confirmed';


-- ---------------------------------------------------------
-- Confirmed IOU-payment calculations
-- ---------------------------------------------------------

create index if not exists
idx_iou_payments_confirmed_lookup
on public.iou_payments (
  iou_id,
  from_person_id,
  to_person_id
)
include (
  amount
)
where status = 'confirmed';