import type { Json } from "@/types/database";

export const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type RecurringTimelineStatus =
  | "paid"
  | "paid_advance"
  | "pending"
  | "due"
  | "upcoming"
  | "not_applicable"
  | "skipped"
  | "group";

export type RecurringTimelineMonth = {
  month: number;
  periodId: string | null;
  dueDate: string | null;
  status: RecurringTimelineStatus;
};

export type RecurringOverview = {
  id: string;
  name: string;
  groupName: string;
  payerName: string;
  payerPersonId: string;
  frequency: string;
  arrangementStatus: "active" | "paused" | "ended";
  startDate: string;
  endDate: string | null;
  totalAmount: number;
  userShare: number;
  userReceives: number;
  nextDueDate: string | null;
  timeline: RecurringTimelineMonth[];
};

export type RecurringParticipant = {
  personId: string;
  name: string;
  shareAmount: number;
  isPayer: boolean;
  avatarColor: string | null;
  avatarPath: string | null;
};

export type RecurringObligation = {
  id: string;
  personId: string;
  name: string;
  shareAmount: number;
  paymentStatus: "unpaid" | "pending" | "paid" | "skipped";
  paymentId: string | null;
  paymentRecordStatus: "pending" | "confirmed" | "rejected" | null;
  paidAt: string | null;
};

export type RecurringPeriod = {
  id: string;
  periodStart: string;
  dueDate: string;
  totalAmount: number;
  state: "open" | "skipped";
  skipReason: string | null;
  viewerStatus: RecurringTimelineStatus;
  obligations: RecurringObligation[];
};

export type RecurringDetail = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  payerPersonId: string;
  payerName: string;
  frequency: string;
  status: "active" | "paused" | "ended";
  startDate: string;
  endDate: string | null;
  canEdit: boolean;
  isPayer: boolean;
  allowDebtorSelfConfirm: boolean;
  currentVersion: {
    id: string;
    effectiveFrom: string;
    totalAmount: number;
    dueDay: number;
    participants: RecurringParticipant[];
  };
  periods: RecurringPeriod[];
};

export const recurringStatusCopy: Record<
  RecurringTimelineStatus,
  { label: string; symbol: string; className: string }
> = {
  paid: {
    label: "Paid",
    symbol: "✓",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  },
  paid_advance: {
    label: "Paid early",
    symbol: "↗",
    className: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  },
  pending: {
    label: "Waiting for confirmation",
    symbol: "…",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  },
  due: {
    label: "Payment due",
    symbol: "!",
    className: "border-red-500/25 bg-red-500/10 text-red-300",
  },
  upcoming: {
    label: "Upcoming",
    symbol: "○",
    className: "border-white/10 bg-white/[0.04] text-muted-foreground",
  },
  not_applicable: {
    label: "Not active",
    symbol: "—",
    className: "border-transparent bg-white/[0.02] text-zinc-600",
  },
  skipped: {
    label: "Skipped",
    symbol: "⊘",
    className: "border-purple-500/20 bg-purple-500/10 text-purple-300",
  },
  group: {
    label: "Group view",
    symbol: "•",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  },
};

export function splitAmountEqually(total: number, participantIds: string[]) {
  if (participantIds.length === 0) return {};
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / participantIds.length);
  const remainder = totalCents % participantIds.length;

  return Object.fromEntries(
    participantIds.map((id, index) => [
      id,
      (base + (index < remainder ? 1 : 0)) / 100,
    ]),
  );
}

export function isMonthApplicable(
  year: number,
  month: number,
  startDate: string,
  endDate: string | null,
) {
  const monthKey = year * 12 + month - 1;
  const start = new Date(`${startDate}T00:00:00Z`);
  const startKey = start.getUTCFullYear() * 12 + start.getUTCMonth();
  if (monthKey < startKey) return false;
  if (!endDate) return true;
  const end = new Date(`${endDate}T00:00:00Z`);
  return monthKey <= end.getUTCFullYear() * 12 + end.getUTCMonth();
}

export function sumSelectedPeriods(
  periods: Array<{ id: string; shareAmount: number }>,
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  const cents = periods.reduce(
    (total, period) => total + (selected.has(period.id) ? Math.round(period.shareAmount * 100) : 0),
    0,
  );
  return cents / 100;
}

export function parseRecurringDetail(value: Json | null): RecurringDetail | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  const currentVersion = isObject(value.current_version)
    ? value.current_version
    : null;
  if (!currentVersion || typeof currentVersion.id !== "string") return null;

  return {
    id: value.id,
    name: asString(value.name),
    groupId: asString(value.group_id),
    groupName: asString(value.group_name),
    payerPersonId: asString(value.payer_person_id),
    payerName: asString(value.payer_name),
    frequency: asString(value.frequency),
    status: asArrangementStatus(value.status),
    startDate: asString(value.start_date),
    endDate: nullableString(value.end_date),
    canEdit: value.can_edit === true,
    isPayer: value.is_payer === true,
    allowDebtorSelfConfirm: value.allow_debtor_self_confirm === true,
    currentVersion: {
      id: currentVersion.id,
      effectiveFrom: asString(currentVersion.effective_from),
      totalAmount: asNumber(currentVersion.total_amount),
      dueDay: asNumber(currentVersion.due_day),
      participants: asArray(currentVersion.participants).flatMap((item) => {
        if (!isObject(item) || typeof item.person_id !== "string") return [];
        return [{
          personId: item.person_id,
          name: asString(item.name),
          shareAmount: asNumber(item.share_amount),
          isPayer: item.is_payer === true,
          avatarColor: nullableString(item.avatar_color),
          avatarPath: nullableString(item.avatar_path),
        }];
      }),
    },
    periods: asArray(value.periods).flatMap((item) => {
      if (!isObject(item) || typeof item.id !== "string") return [];
      return [{
        id: item.id,
        periodStart: asString(item.period_start),
        dueDate: asString(item.due_date),
        totalAmount: asNumber(item.total_amount),
        state: item.state === "skipped" ? "skipped" as const : "open" as const,
        skipReason: nullableString(item.skip_reason),
        viewerStatus: asTimelineStatus(item.viewer_status),
        obligations: asArray(item.obligations).flatMap((obligation) => {
          if (!isObject(obligation) || typeof obligation.id !== "string") return [];
          return [{
            id: obligation.id,
            personId: asString(obligation.person_id),
            name: asString(obligation.name),
            shareAmount: asNumber(obligation.share_amount),
            paymentStatus: asObligationStatus(obligation.payment_status),
            paymentId: nullableString(obligation.payment_id),
            paymentRecordStatus: asPaymentStatus(obligation.payment_status_record),
            paidAt: nullableString(obligation.paid_at),
          }];
        }),
      }];
    }),
  };
}

export function parseRecurringTimeline(value: Json): RecurringTimelineMonth[] {
  return asArray(value).flatMap((item) => {
    if (!isObject(item) || typeof item.month !== "number") return [];
    return [{
      month: item.month,
      periodId: nullableString(item.period_id),
      dueDate: nullableString(item.due_date),
      status: asTimelineStatus(item.status),
    }];
  });
}

function isObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: Json | undefined) {
  return typeof value === "number" ? value : Number(value) || 0;
}

function asArrangementStatus(value: Json | undefined): RecurringDetail["status"] {
  return value === "paused" || value === "ended" ? value : "active";
}

function asTimelineStatus(value: Json | undefined): RecurringTimelineStatus {
  const status = asString(value) as RecurringTimelineStatus;
  return status in recurringStatusCopy ? status : "not_applicable";
}

function asObligationStatus(value: Json | undefined): RecurringObligation["paymentStatus"] {
  return value === "pending" || value === "paid" || value === "skipped"
    ? value
    : "unpaid";
}

function asPaymentStatus(value: Json | undefined): RecurringObligation["paymentRecordStatus"] {
  return value === "pending" || value === "confirmed" || value === "rejected"
    ? value
    : null;
}
