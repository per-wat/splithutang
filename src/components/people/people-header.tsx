import { AppMenu } from "@/components/layout/app-menu";

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

        <AppMenu />
      </div>
    </header>
  );
}
