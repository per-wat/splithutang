export type Activity = {
  id: string;
  type: "expense" | "iou";
  title: string;
  date: string;
  amount: number;
  createdAt: string;
};

type RecentActivityProps = {
  activities: Activity[];
};

function formatCurrency(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <section className="px-5 pb-8 pt-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Recent Activity
      </h2>

      {activities.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          {activities.map((activity, index) => (
            <div
              key={`${activity.type}-${activity.id}`}
              className={`flex items-center justify-between px-4 py-4 ${
                index !== activities.length - 1
                  ? "border-b border-white/[0.06]"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{activity.title}</p>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activity.date}
                </p>
              </div>

              <p className="ml-4 shrink-0 font-semibold">
                {formatCurrency(activity.amount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        </div>
      )}
    </section>
  );
}
