type IouCardProps = {
  title: string;
  date: string;
  from: string;
  to: string;
  amount: number;
  status: "owed-to-me" | "i-owe" | "settled";
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
};

export function IouCard({
  title,
  date,
  from,
  to,
  amount,
  status,
}: IouCardProps) {
  const statusInfo = statusStyles[status];

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{title}</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            {from} → {to} · {date}
          </p>
        </div>

        <p className="shrink-0 font-bold">{formatCurrency(amount)}</p>
      </div>

      <div className="mt-3">
        <span className={`text-xs font-medium ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
      </div>
    </div>
  );
}
