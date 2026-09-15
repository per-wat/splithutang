import Link from "next/link";
import {
  Check,
  CreditCard,
  Receipt,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  getLearningProgress,
  type LearningProgressSignals,
} from "@/lib/onboarding/learning";

type LearningStep = {
  id: "group" | "expense" | "payment";
  title: string;
  description: string;
  complete: boolean;
  icon: LucideIcon;
  href: string;
  action: string;
  note?: string;
};

export function LearningBasics({
  signals,
}: {
  signals: LearningProgressSignals;
}) {
  const progress = getLearningProgress(signals);
  const steps: LearningStep[] = [
    {
      id: "group",
      title: "Create or join a group",
      description: "Groups keep expenses between the right people.",
      complete: signals.hasGroup,
      icon: UsersRound,
      href: "/groups/new",
      action: "Create a group",
      note: "You can also join when a friend sends you an invitation link.",
    },
    {
      id: "expense",
      title: "Add your first shared expense",
      description:
        "Paid for dinner for your friends? Add it and SplitHutang will work out who needs to pay you back.",
      complete: signals.hasSharedExpense,
      icon: Receipt,
      href: signals.hasGroup ? "/add-expense" : "/groups/new",
      action: signals.hasGroup ? "Add an expense" : "Create a group first",
    },
    {
      id: "payment",
      title: "Record your first payment",
      description:
        "When money is paid back, record it so everyone can see what is still unpaid.",
      complete: signals.hasPayment,
      icon: CreditCard,
      href: signals.hasSharedExpense ? "/expenses" : "/add-expense",
      action: signals.hasSharedExpense ? "View expenses" : "Add an expense first",
      note: signals.hasSharedExpense
        ? "Open an expense, then choose I’ve paid or Mark as received."
        : undefined,
    },
  ];

  return (
    <section
      className="mt-7"
      aria-labelledby="learn-the-basics-title"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-400">
            Next steps
          </p>
          <h2 id="learn-the-basics-title" className="mt-1 text-lg font-bold">
            Learn the basics
          </h2>
        </div>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          {progress.completedCount} of {progress.totalCount} complete
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full transition-[width] ${
            progress.complete ? "bg-emerald-500" : "bg-blue-500"
          }`}
          style={{
            width: `${(progress.completedCount / progress.totalCount) * 100}%`,
          }}
        />
      </div>

      {progress.complete && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.08] p-4 text-emerald-200">
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">You&apos;re ready to use SplitHutang 🎉</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">
              You have completed the essential group, expense, and payment
              actions.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <LearningStepCard key={step.id} step={step} number={index + 1} />
        ))}
      </div>
    </section>
  );
}

function LearningStepCard({
  step,
  number,
}: {
  step: LearningStep;
  number: number;
}) {
  const Icon = step.icon;

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
            step.complete
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-white/[0.06] text-blue-400"
          }`}
        >
          {step.complete ? (
            <Check className="size-5" />
          ) : (
            <Icon className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Step {number}
          </p>
          <h3 className="mt-0.5 font-semibold">{step.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {step.description}
          </p>
          {step.note && (
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {step.note}
            </p>
          )}
        </div>
      </div>

      {step.complete ? (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-300">
          <Check className="size-4" /> Completed from your SplitHutang activity
        </div>
      ) : (
        <Link
          href={step.href}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          {step.action}
        </Link>
      )}
    </article>
  );
}
