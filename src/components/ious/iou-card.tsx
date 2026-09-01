export type IouStatus = "owed-to-me" | "i-owe" | "settled" | "group";

type IouCardProps = {
  title: string;
  date: string;
  from: string;
  to: string;
  amount: number;
  originalAmount: number;
  status: IouStatus;
};

function formatCurrency(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

const statusStyles = {
  "owed-to-me": {
    label: "Owed to you",
    className: "text-emerald-400",
  },

  "i-owe": {
    label: "You owe",
    className: "text-red-400",
  },

  settled: {
    label: "Settled",
    className: "text-muted-foreground",
  },

  group: {
    label: "Group IOU",
    className: "text-blue-400",
  },
};

export function IouCard({
  title,
  date,
  from,
  to,
  amount,
  originalAmount,
  status,
}: IouCardProps) {
  const statusInfo = statusStyles[status];

  const hasPartialPayment = amount > 0 && amount < originalAmount;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{title}</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            {from} → {to} · {date}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-bold">{formatCurrency(amount)}</p>

          {hasPartialPayment && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              of {formatCurrency(originalAmount)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <span className={`text-xs font-medium ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
      </div>
    </div>
  );
}
