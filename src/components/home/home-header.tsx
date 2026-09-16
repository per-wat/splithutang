import { AppMenu } from "@/components/layout/app-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";

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

        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />

          <AppMenu
            initialProfile={{ displayName, avatarColor, avatarUrl }}
          />
        </div>
      </div>
    </header>
  );
}
