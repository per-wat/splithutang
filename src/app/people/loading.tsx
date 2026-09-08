import { ListPageLoading } from "@/components/layout/list-page-loading";
import { PeopleHeader } from "@/components/people/people-header";

export default function Loading() {
  return (
    <>
      <PeopleHeader />
      <ListPageLoading variant="people" />
    </>
  );
}
