import Link from "next/link";

import { ProfileAvatar } from "@/components/profile/profile-avatar";

type HomeHeaderProps = {
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
};

export function HomeHeader({
  displayName,
  avatarColor,
  avatarUrl,
}: HomeHeaderProps) {
  return (
    <header className="px-5 pt-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            Welcome back
          </p>

          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight">
            SplitHutang
          </h1>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {displayName}
          </p>
        </div>

        <Link
          href="/profile"
          aria-label="Profile and settings"
          className="shrink-0 rounded-full transition-transform active:scale-95"
        >
          <ProfileAvatar
            name={displayName}
            avatarColor={avatarColor}
            avatarUrl={avatarUrl}
            className="size-12 text-base ring-2 ring-white/[0.08]"
          />
        </Link>
      </div>
    </header>
  );
}
