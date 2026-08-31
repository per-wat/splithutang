type OutstandingPerson = {
  id: number;
  name: string;
  amount: number;
};

const outstandingPeople: OutstandingPerson[] = [
  {
    id: 1,
    name: "Ahmad",
    amount: 41.66,
  },
  {
    id: 2,
    name: "Sarah",
    amount: 43.0,
  },
  {
    id: 3,
    name: "Raj",
    amount: 45.0,
  },
];

function formatCurrency(amount: number) {
  return `RM ${amount.toFixed(2)}`;
}

export function OutstandingList() {
  return (
    <section className="px-5 pt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Outstanding
        </h2>

        <span className="text-xs text-muted-foreground">
          {outstandingPeople.length} people
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
        {outstandingPeople.map((person, index) => (
          <div
            key={person.id}
            className={`flex items-center justify-between px-4 py-4 ${
              index !== outstandingPeople.length - 1
                ? "border-b border-white/[0.06]"
                : ""
            }`}
          >
            <div>
              <p className="font-medium">{person.name}</p>

              <p className="mt-0.5 text-xs text-muted-foreground">owes you</p>
            </div>

            <p className="font-semibold text-emerald-400">
              {formatCurrency(person.amount)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
