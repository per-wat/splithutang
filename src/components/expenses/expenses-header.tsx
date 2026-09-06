import { NotificationBell } from "@/components/notifications/notification-bell";

export function ExpensesHeader() {
  return (
    <header className="px-5 pt-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            Expenses
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Keep track of shared spending
          </p>
        </div>

        <NotificationBell />
      </div>
    </header>
  );
}
