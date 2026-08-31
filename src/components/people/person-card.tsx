import { UserRound } from "lucide-react";

type PersonCardProps = {
  name: string;
  balance: number;
};

function formatCurrency(amount: number) {
  const absoluteAmount = Math.abs(amount);

  return `RM ${absoluteAmount.toFixed(2)}`;
}

export function PersonCard({ name, balance }: PersonCardProps) {
  const isPositive = balance > 0;
  const isSettled = balance === 0;

  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
        <UserRound className="size-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>

        <p
          className={`mt-0.5 text-xs ${
            isSettled
              ? "text-muted-foreground"
              : isPositive
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          {isSettled ? "Settled" : isPositive ? "Owes you" : "You owe"}
        </p>
      </div>

      <div className="text-right">
        <p
          className={`font-semibold ${
            isSettled
              ? "text-muted-foreground"
              : isPositive
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          {isSettled ? "" : isPositive ? "+" : "-"}
          {formatCurrency(balance)}
        </p>
      </div>
    </div>
  );
}
