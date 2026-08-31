import { BalanceSummary } from "@/components/home/balance-summary";
import { HomeHeader } from "@/components/home/home-header";
import { OutstandingList } from "@/components/home/outstanding-list";
import { RecentActivity } from "@/components/home/recent-activity";
import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <AppShell>
      <HomeHeader />

      <BalanceSummary
        owedToYou={175}
        youOwe={45.34}
      />

      <OutstandingList />

      <RecentActivity />
    </AppShell>
  );
}
