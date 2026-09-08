import { ExpensesHeader } from "@/components/expenses/expenses-header";
import { ListPageLoading } from "@/components/layout/list-page-loading";

export default function Loading() {
  return (
    <>
      <ExpensesHeader />
      <ListPageLoading />
    </>
  );
}
