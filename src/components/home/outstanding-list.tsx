import { ProfileAvatar } from "@/components/profile/profile-avatar";

export type OutstandingPerson = {
  id: string;
  name: string;
  amount: number;

  avatarColor: string;

  avatarPath: string | null;
};

type OutstandingListProps = {
  people: OutstandingPerson[];
};

function formatCurrency(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function OutstandingList({ people }: OutstandingListProps) {
  return (
    <section className="px-5 pt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Outstanding
        </h2>

        <span className="text-xs text-muted-foreground">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      </div>

      {people.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          {people.map((person, index) => (
            <div
              key={person.id}
              className={`flex items-center justify-between px-4 py-4 ${
                index !== people.length - 1
                  ? "border-b border-white/[0.06]"
                  : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar
                  name={person.name}
                  avatarColor={person.avatarColor}
                  avatarPath={person.avatarPath}
                  className="size-10 text-sm"
                />

                <div className="min-w-0">
                  <p className="truncate font-medium">{person.name}</p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    owes you
                  </p>
                </div>
              </div>

              <p className="font-semibold text-emerald-400">
                {formatCurrency(person.amount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nobody owes you right now.
          </p>
        </div>
      )}
    </section>
  );
}
