import { BottomNav } from "./bottom-nav";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto min-h-dvh w-full max-w-md pb-24">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
