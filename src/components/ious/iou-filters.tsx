"use client";

export const iouFilters = ["All", "Owed to Me", "I Owe", "Settled"] as const;

export type IouFilter = (typeof iouFilters)[number];

type IouFiltersProps = {
  activeFilter: IouFilter;
  onChange: (filter: IouFilter) => void;
};

export function IouFilters({ activeFilter, onChange }: IouFiltersProps) {
  return (
    <section className="px-5 pt-6">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {iouFilters.map((filter) => {
          const isActive = activeFilter === filter;

          return (
            <button
              key={filter}
              type="button"
              onClick={() => onChange(filter)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground"
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>
    </section>
  );
}
