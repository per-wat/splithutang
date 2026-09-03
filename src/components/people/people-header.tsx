import Link from "next/link";
import { UsersRound } from "lucide-react";

export function PeopleHeader() {
  return (
    <header className="px-5 pt-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            People
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Everyone you split expenses with
          </p>
        </div>

        <Link
          href="/groups"
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <UsersRound className="size-4" />
          Groups
        </Link>
      </div>
    </header>
  );
}
