export default function UsageLoading() {
  return (
    <div className="space-y-4 px-5 pb-10 pt-6" aria-label="Loading usage">
      <div className="h-28 animate-pulse rounded-3xl bg-white/[0.05]" />
      <div className="h-5 w-40 animate-pulse rounded bg-white/[0.05]" />
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-2xl bg-white/[0.05]"
        />
      ))}
    </div>
  );
}
