"use client";

import Link from "next/link";
import {
  BellRing,
  Check,
  ChevronRight,
  CreditCard,
  Receipt,
  Smartphone,
  UsersRound,
} from "lucide-react";

import { useSetupStatus } from "@/components/onboarding/use-setup-status";
import {
  getHomeOnboardingSection,
  getLearningProgress,
  type LearningProgressSignals,
} from "@/lib/onboarding/learning";

export function GettingStartedCard({
  dismissed,
  learningProgress,
}: {
  dismissed: boolean;
  learningProgress: LearningProgressSignals;
}) {
  const { installState, notificationState, progress } = useSetupStatus();

  if (installState === "checking" || notificationState === "checking") {
    return null;
  }

  const section = getHomeOnboardingSection({
    dismissed,
    setupComplete: progress.complete,
    learning: learningProgress,
  });

  if (!section) return null;

  if (section === "learning") {
    return <LearningCard progress={learningProgress} />;
  }

  return (
    <section className="px-5 pt-6" aria-labelledby="getting-started-card-title">
      <Link
        href="/getting-started"
        className="block rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/[0.14] to-card p-4 shadow-lg shadow-blue-950/10 transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Smartphone className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="getting-started-card-title" className="font-semibold">
                  Finish setting up SplitHutang
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress.completedCount} of {progress.totalCount} complete
                </p>
              </div>
              <ChevronRight className="mt-1 size-5 shrink-0 text-blue-400" />
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width]"
                style={{
                  width: `${(progress.completedCount / progress.totalCount) * 100}%`,
                }}
              />
            </div>

            <div className="mt-3 grid gap-2 text-xs">
              <SetupRow
                complete={progress.installed}
                icon={Smartphone}
                label="Add to Home Screen"
              />
              <SetupRow
                complete={progress.notificationsEnabled}
                icon={BellRing}
                label="Turn on notifications"
              />
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

function LearningCard({ progress }: { progress: LearningProgressSignals }) {
  const learning = getLearningProgress(progress);

  return (
    <section className="px-5 pt-6" aria-labelledby="learning-card-title">
      <Link
        href="/getting-started"
        className="block rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/[0.14] to-card p-4 shadow-lg shadow-blue-950/10 transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <UsersRound className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="learning-card-title" className="font-semibold">
                  Learn the basics
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {learning.completedCount} of {learning.totalCount} complete
                </p>
              </div>
              <ChevronRight className="mt-1 size-5 shrink-0 text-blue-400" />
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width]"
                style={{
                  width: `${(learning.completedCount / learning.totalCount) * 100}%`,
                }}
              />
            </div>

            <div className="mt-3 grid gap-2 text-xs">
              <SetupRow
                complete={learning.hasGroup}
                icon={UsersRound}
                label="Create or join a group"
              />
              <SetupRow
                complete={learning.hasSharedExpense}
                icon={Receipt}
                label="Add a shared expense"
              />
              <SetupRow
                complete={learning.hasPayment}
                icon={CreditCard}
                label="Record a payment"
              />
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

function SetupRow({
  complete,
  icon: Icon,
  label,
}: {
  complete: boolean;
  icon: typeof Smartphone;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        complete ? "text-emerald-300" : "text-zinc-300"
      }`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-full ${
          complete ? "bg-emerald-500/15" : "bg-white/[0.06]"
        }`}
      >
        {complete ? <Check className="size-3" /> : <Icon className="size-3" />}
      </span>
      {label}
    </div>
  );
}
