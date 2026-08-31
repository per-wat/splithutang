type BalanceSummaryProps = {
  owedToYou: number;
  youOwe: number;
};

function formatCurrency(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function BalanceSummary({ owedToYou, youOwe }: BalanceSummaryProps) {
  return (
    <section className="grid grid-cols-2 gap-3 px-5 pt-6">
      <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.08] p-4">
        <p className="text-sm font-medium text-emerald-400">You are owed</p>

        <p className="mt-2 text-[22px] font-bold tracking-tight text-emerald-300">
          {formatCurrency(owedToYou)}
        </p>
      </div>

      <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.08] p-4">
        <p className="text-sm font-medium text-red-400">You owe</p>

        <p className="mt-2 text-[22px] font-bold tracking-tight text-red-300">
          {formatCurrency(youOwe)}
        </p>
      </div>
    </section>
  );
}
