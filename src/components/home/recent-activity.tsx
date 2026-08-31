type Activity = {
  id: number;
  title: string;
  date: string;
  amount: number;
};

const recentActivities: Activity[] = [
  {
    id: 1,
    title: "Dinner at Seoul Garden",
    date: "22 Aug",
    amount: 180,
  },
  {
    id: 2,
    title: "Borrowed for parking",
    date: "21 Aug",
    amount: 25,
  },
  {
    id: 3,
    title: "Pizza Night",
    date: "20 Aug",
    amount: 85,
  },
  {
    id: 4,
    title: "Grab Ride",
    date: "19 Aug",
    amount: 30,
  },
];

function formatCurrency(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function RecentActivity() {
  return (
    <section className="px-5 pb-8 pt-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Recent Activity
      </h2>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
        {recentActivities.map((activity, index) => (
          <div
            key={activity.id}
            className={`flex items-center justify-between px-4 py-4 ${
              index !== recentActivities.length - 1
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
    </section>
  );
}
