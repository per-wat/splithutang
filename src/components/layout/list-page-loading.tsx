type ListPageLoadingProps = {
  variant?: "cards" | "people";
};

function SkeletonLine({ className }: { className: string }) {
  return <div className={`rounded-full bg-white/[0.07] ${className}`} />;
}

export function ListPageLoading({
  variant = "cards",
}: ListPageLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="animate-pulse"
    >
      <span className="sr-only">Loading page</span>

      <div className="px-5 pt-6">
        {variant === "people" ? (
          <div className="h-12 rounded-2xl border border-white/[0.08] bg-card" />
        ) : (
          <div className="flex gap-2 overflow-hidden">
            {[64, 104, 76, 72].map((width) => (
              <div
                key={width}
                className="h-9 shrink-0 rounded-full border border-white/[0.08] bg-card"
                style={{ width }}
              />
            ))}
          </div>
        )}
      </div>

      <section className="space-y-3 px-5 pb-8 pt-6">
        {variant === "people" && (
          <SkeletonLine className="mb-4 h-3 w-24" />
        )}

        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className={`border border-white/[0.08] bg-card p-4 ${
              variant === "people"
                ? "first:rounded-t-2xl last:rounded-b-2xl"
                : "rounded-2xl"
            }`}
          >
            <div className="flex items-center gap-3">
              {variant === "people" && (
                <div className="size-11 shrink-0 rounded-full bg-white/[0.07]" />
              )}
              <div className="min-w-0 flex-1 space-y-3">
                <SkeletonLine className="h-4 w-2/3" />
                <SkeletonLine className="h-3 w-2/5" />
              </div>
              <SkeletonLine className="h-4 w-16" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
