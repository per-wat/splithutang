import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function SkeletonLine({ className }: { className: string }) {
  return <div className={`rounded-full bg-white/[0.07] ${className}`} />;
}

export default function Loading() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="mx-auto min-h-dvh w-full max-w-md animate-pulse px-4 pb-10"
      >
        <span className="sr-only">Loading new group form</span>

        <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-background px-4 pb-3 pt-6">
          <Link
            href="/groups"
            aria-label="Back to groups"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">New Group</h1>
        </header>

        <section className="mt-4">
          <SkeletonLine className="h-4 w-24" />
          <div className="mt-2 h-12 rounded-2xl border border-border bg-card" />
        </section>

        <section className="mt-6">
          <SkeletonLine className="h-4 w-20" />
          <SkeletonLine className="mt-3 h-3 w-64 max-w-full" />
          <div className="mt-3 rounded-2xl border border-white/[0.08] bg-card p-4">
            <SkeletonLine className="h-4 w-48 max-w-full" />
            <SkeletonLine className="mt-3 h-3 w-56 max-w-full" />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[0.08] bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <SkeletonLine className="h-4 w-36" />
              <SkeletonLine className="mt-3 h-3 w-full" />
              <SkeletonLine className="mt-2 h-3 w-3/4" />
            </div>
            <div className="h-7 w-12 shrink-0 rounded-full bg-white/[0.07]" />
          </div>
        </section>

        <div className="mt-6 h-12 rounded-2xl bg-blue-600/40" />
      </div>
    </main>
  );
}
