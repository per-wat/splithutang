import { ChevronDown, CircleHelp } from "lucide-react";

const helpTopics = [
  {
    title: "Splitting something you paid for",
    body: "You paid RM120 for dinner. Add a shared expense, choose who joined, and SplitHutang calculates each person's share.",
  },
  {
    title: "When someone else paid",
    body: "Choose your friend as the person who paid. Your share will appear under what you need to pay.",
  },
  {
    title: "Recording a payment",
    body: "Open the expense after money changes hands. Choose I’ve paid if you paid, or Mark as received if someone paid you.",
  },
  {
    title: "Confirming money received",
    body: "When confirmation is required, the person receiving the money can confirm it. Only confirmed payments reduce the amount still unpaid.",
  },
  {
    title: "Groups and people",
    body: "Groups keep the right friends and expenses together. People are added through groups and can later connect to their own account.",
  },
  {
    title: "Recurring payments",
    body: "Use Recurring for something friends share every month, such as Netflix, rent, or internet. It is optional for getting started.",
  },
] as const;

export function HowSplitHutangWorks() {
  return (
    <section className="mt-8" aria-labelledby="how-splithutang-works-title">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-300">
          <CircleHelp className="size-5" />
        </div>
        <div>
          <h2 id="how-splithutang-works-title" className="font-semibold">
            How SplitHutang works
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Quick answers you can revisit anytime
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
        {helpTopics.map((topic, index) => (
          <details
            key={topic.title}
            className={`group px-4 ${
              index > 0 ? "border-t border-white/[0.06]" : ""
            }`}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-semibold">
              {topic.title}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-4 text-xs leading-relaxed text-muted-foreground">
              {topic.body}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
