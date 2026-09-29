export type InstallmentEstimate = {
  principalCents: number;
  profitCents: number;
  totalCents: number;
  monthlyCents: number;
  finalCents: number;
};

export function calculateInstallment(
  amount: number,
  months: number,
  annualRate: number,
): InstallmentEstimate | null {
  const cents = amount * 100;

  if (
    !Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000_000 ||
    Math.abs(cents - Math.round(cents)) > 0.000001 ||
    !Number.isInteger(months) || months < 1 || months > 600 ||
    !Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100
  ) {
    return null;
  }

  const principalCents = Math.round(cents);
  // Flat annual rate on the original amount. Round the total profit once,
  // then use the final payment to absorb the monthly rounding difference.
  const profitCents = Math.round(principalCents * (annualRate / 100) * (months / 12));
  const totalCents = principalCents + profitCents;
  const monthlyCents = Math.round(totalCents / months);
  const finalCents = totalCents - monthlyCents * (months - 1);

  return { principalCents, profitCents, totalCents, monthlyCents, finalCents };
}
