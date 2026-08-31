import { IouCard } from "@/components/ious/iou-card";
import { IouFilters } from "@/components/ious/iou-filters";
import { IousHeader } from "@/components/ious/ious-header";
import { AppShell } from "@/components/layout/app-shell";

const ious = [
  {
    id: 1,
    title: "Borrowed for parking",
    date: "21 Aug",
    from: "Ahmad",
    to: "You",
    amount: 25,
    status: "owed-to-me" as const,
  },
  {
    id: 2,
    title: "Movie snacks",
    date: "20 Aug",
    from: "You",
    to: "Sarah",
    amount: 17,
    status: "i-owe" as const,
  },
  {
    id: 3,
    title: "Concert ticket",
    date: "18 Aug",
    from: "Raj",
    to: "You",
    amount: 65,
    status: "owed-to-me" as const,
  },
  {
    id: 4,
    title: "Lunch money",
    date: "17 Aug",
    from: "You",
    to: "Ahmad",
    amount: 32,
    status: "settled" as const,
  },
];

export default function IousPage() {
  return (
    <AppShell>
      <IousHeader />

      <IouFilters />

      <section className="space-y-3 px-5 pb-8 pt-5">
        {ious.map((iou) => (
          <IouCard
            key={iou.id}
            title={iou.title}
            date={iou.date}
            from={iou.from}
            to={iou.to}
            amount={iou.amount}
            status={iou.status}
          />
        ))}
      </section>
    </AppShell>
  );
}
