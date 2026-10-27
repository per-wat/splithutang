import { kindLabels, type Category, type ItemAssessment, type PurchaseKind, type ReceiptInput, type TaxReceipt, type AssessedReceipt } from "./model.ts";

// Append a new version when guidance changes; never overwrite a published
// version. Existing receipts keep the rule version used at their last review.
export const ruleSets = {
  "2025.1": {
    year: 2025, limits: { lifestyle: 250_000, sports: 100_000 },
    source: "https://www.hasil.gov.my/wp-content/uploads/notapenerangan_be2025_1.pdf",
    reference: "LHDN BE 2025 notes, G9 and G10",
  },
  "2026.1": {
    year: 2026, limits: { lifestyle: 250_000, sports: 100_000 },
    source: "https://www.hasil.gov.my/wp-content/uploads/nota-penerangan-tp1-2026.pdf",
    reference: "LHDN TP1 2026 notes, C5 and C6",
  },
} as const;
export const categoryLabels: Record<Category, string> = { lifestyle: "Lifestyle", sports: "Sports" };
export function rulesForYear(year: number) {
  return Object.values(ruleSets).find((rules) => rules.year === year) ?? null;
}
export function rulesVersionForYear(year: number) {
  return Object.entries(ruleSets).find(([, rules]) => rules.year === year)?.[0] ?? "unreviewed";
}
export function categoryForKind(kind: PurchaseKind): Category | null {
  if (["books", "device", "internet", "course"].includes(kind)) return "lifestyle";
  if (kind.startsWith("sports_")) return "sports";
  return null;
}
export const itemConditions: Record<PurchaseKind, { question: string; explanation: string }> = {
  unsure: { question: "What did you buy?", explanation: "Use a suggestion below or keep this item for checking. Saving it does not mean it is ineligible." },
  other: { question: "This purchase needs a separate review", explanation: "Medical, childcare, insurance and other categories are not assessed in this first version. Keep the receipt and check the year's LHDN guidance." },
  books: { question: "Is this a book, journal, magazine, newspaper or similar reading publication that is not prohibited?", explanation: "Printed and electronic reading materials can qualify. General entertainment and streaming subscriptions are not reading publications." },
  device: { question: "Is this for a personal computer, smartphone or tablet used personally, with warranty add-ons, accessories and business costs excluded from the amount?", explanation: "Enter only the qualifying device portion. A mixed receipt may also include a case, charger or extended warranty; exclude those from this item." },
  internet: { question: "Is the internet subscription registered in your name for personal or family use?", explanation: "Use the internet service portion only. A mobile plan or bundled bill may include calls, devices or other charges that need separating." },
  course: { question: "Is this personal skills or self-development learning unrelated to your job, with the same fees excluded from any other education claim?", explanation: "Examples include hobby, language or religious learning. Work training, qualifications and other education fees need a separate review if you are unsure." },
  sports_equipment: { question: "Is this equipment for a sport listed under the Sports Development Act 1997, excluding clothing, footwear and motorised bicycles?", explanation: "Confirm the sport and equipment type with LHDN's guidance. Sports branding alone does not establish eligibility." },
  sports_facility: { question: "Is this rental or admission specifically for using a sports facility?", explanation: "Separate sports facility charges from meals, transport, accommodation and other purchases." },
  sports_competition: { question: "Is the competition organiser approved and licensed by the Commissioner of Sports?", explanation: "Check the organiser's registration or ask for confirmation. An event ticket alone does not confirm this condition." },
  sports_training: { question: "Is the provider registered with the Commissioner of Sports or incorporated under the Companies Act 2016, for a listed sports activity?", explanation: "Ask the gym or training provider for its registration details. If you cannot confirm, choose Not sure and keep the receipt." },
};

// Conservative keyword suggestions only. Never used as eligibility decisions.
export function suggestKinds(description: string): PurchaseKind[] {
  const text = description.toLowerCase();
  const candidates: PurchaseKind[] = [];
  if (/\b(phone|smartphone|iphone|laptop|computer|tablet|ipad)\b/.test(text)) candidates.push("device");
  if (/\b(book|books|journal|magazine|ebook|buku)\b/.test(text)) candidates.push("books");
  if (/\b(internet|broadband|unifi|fibre|fiber)\b/.test(text)) candidates.push("internet");
  if (/\b(course|kursus|language)\b/.test(text)) candidates.push("course");
  if (/\b(gym|training|fitness)\b/.test(text)) candidates.push("sports_training");
  if (/\b(racket|racquet|shuttlecock|dumbbell|bola)\b/.test(text)) candidates.push("sports_equipment");
  if (/\b(court|gelanggang|pool|facility)\b/.test(text)) candidates.push("sports_facility");
  if (/\b(marathon|competition|tournament)\b/.test(text)) candidates.push("sports_competition");
  return candidates;
}

export function assessReceipt(input: ReceiptInput, version: string): ItemAssessment[] {
  const year = Number(input.purchaseDate.slice(0, 4));
  const rules = ruleSets[version as keyof typeof ruleSets];
  return input.items.map((item) => {
    const category = categoryForKind(item.kind);
    const unresolved: string[] = [];
    const denied: string[] = [];
    if (!rules || rules.year !== year) return { category, status: "needs_checking", eligibleCents: 0, reasons: [`Rules for assessment year ${year} have not been verified in this helper. Keep the receipt and check LHDN's guidance for that year.`] };
    if (!category) return { category, status: "needs_checking", eligibleCents: 0, reasons: ["This purchase type is not yet assessed. Choose a supported purchase type or check the year's LHDN guidance; it has not been classified as ineligible."] };
    if (input.answers.resident === "no") denied.push("This guidance covers Malaysian tax residents. Non-resident treatment requires separate advice.");
    if (input.answers.resident === "unsure") unresolved.push("Confirm your tax-resident status for this assessment year. Citizenship alone does not determine tax residency.");
    if (input.answers.ownExpense === "no") denied.push("Only include the portion you personally bore; remove reimbursed or refunded costs.");
    if (input.answers.ownExpense === "unsure") unresolved.push("Confirm the amount you personally paid after refunds and reimbursements.");
    if (input.answers.claimOnce !== "yes") unresolved.push("Confirm this portion will not also be claimed by another person or under another relief. Check who should claim if using joint assessment.");
    if (item.beneficiary === "unsure") unresolved.push("Identify whether this item benefits you, your spouse, child or parent.");
    else if (item.beneficiary === "other" || (category === "lifestyle" && item.beneficiary === "parent")) denied.push(`The selected beneficiary is outside this ${categoryLabels[category]} category's supported conditions.`);
    if (category === "sports" && item.beneficiary === "parent") {
      if (item.parentResident === "no") denied.push("The parent's Malaysian tax-resident condition is not met.");
      if (item.parentResident === "unsure") unresolved.push("Confirm that your parent is a Malaysian tax resident for this year.");
      if (item.kind === "sports_competition" && year === 2025) unresolved.push("Parent-benefit competition fees need a manual check of the detailed YA2025 beneficiary conditions.");
    }
    if (item.conditionMet === "no") denied.push("Your answer does not meet the purchase-specific condition. Review the item type and the amount included.");
    if (item.conditionMet === "unsure") unresolved.push(itemConditions[item.kind].question);
    if (item.amountCents === 0) unresolved.push("Enter the portion of this item you want to check before it can contribute to the estimate.");
    if (denied.length) return { category, status: "not_eligible", eligibleCents: 0, reasons: denied };
    if (unresolved.length) return { category, status: "needs_checking", eligibleCents: 0, reasons: unresolved };
    return { category, status: "potentially_claimable", eligibleCents: item.amountCents, reasons: [`Your answers match the checked ${categoryLabels[category]} conditions. This is an estimate before the shared annual limit; keep the receipt and review before filing.`] };
  });
}

export function buildYearSummary(receipts: TaxReceipt[], year: number) {
  const rules = rulesForYear(year);
  const categories = (Object.keys(categoryLabels) as Category[]).map((key) => ({
    key, label: categoryLabels[key], limitCents: rules?.limits[key] ?? null,
    eligibleCents: 0, estimatedClaimCents: 0, remainingCents: rules?.limits[key] ?? null, excessCents: 0,
  }));
  // Stable allocation of each annual cap; never resets the cap for each receipt.
  const sorted = receipts.filter((receipt) => receipt.assessmentYear === year)
    .toSorted((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.id.localeCompare(b.id));
  const assessed: AssessedReceipt[] = sorted.map((receipt) => {
    const assessments = assessReceipt(receipt, receipt.rulesVersion);
    const eligibleCents = receipt.deletedAt ? 0 : assessments.reduce((sum, item) => sum + item.eligibleCents, 0);
    let estimatedClaimCents = 0;
    if (!receipt.deletedAt) for (const item of assessments) {
      if (!item.category || !item.eligibleCents) continue;
      const category = categories.find((entry) => entry.key === item.category)!;
      const claim = Math.min(item.eligibleCents, category.remainingCents ?? 0);
      category.eligibleCents += item.eligibleCents;
      category.estimatedClaimCents += claim;
      category.excessCents += item.eligibleCents - claim;
      if (category.remainingCents !== null) category.remainingCents -= claim;
      estimatedClaimCents += claim;
    }
    const status = assessments.some((item) => item.status === "needs_checking") ? "needs_checking"
      : assessments.some((item) => item.status === "potentially_claimable") ? "potentially_claimable" : "not_eligible";
    return { ...receipt, assessments, status, eligibleCents, estimatedClaimCents };
  });
  return {
    year, rules, categories, receipts: assessed,
    totalCents: assessed.reduce((sum, receipt) => sum + (receipt.deletedAt ? 0 : receipt.totalCents), 0),
    eligibleCents: categories.reduce((sum, category) => sum + category.eligibleCents, 0),
    estimatedClaimCents: categories.reduce((sum, category) => sum + category.estimatedClaimCents, 0),
    needsChecking: assessed.filter((receipt) => !receipt.deletedAt && receipt.status === "needs_checking").length,
  };
}
export function itemLabel(kind: PurchaseKind) { return kindLabels[kind]; }
