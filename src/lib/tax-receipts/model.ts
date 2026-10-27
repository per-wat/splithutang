export const answers = ["yes", "no", "unsure"] as const;
export type Answer = (typeof answers)[number];
export const beneficiaries = ["self", "spouse", "child", "parent", "other", "unsure"] as const;
export type Beneficiary = (typeof beneficiaries)[number];
export const purchaseKinds = ["unsure", "books", "device", "internet", "course", "sports_equipment", "sports_facility", "sports_competition", "sports_training", "other"] as const;
export type PurchaseKind = (typeof purchaseKinds)[number];
export type Category = "lifestyle" | "sports";
export type ReceiptStatus = "potentially_claimable" | "needs_checking" | "not_eligible";
export type ReceiptAnswers = { resident: Answer; ownExpense: Answer; claimOnce: Answer };
export type ReceiptItem = {
  kind: PurchaseKind;
  description: string;
  amountCents: number;
  beneficiary: Beneficiary;
  conditionMet: Answer;
  parentResident: Answer;
};
export type ReceiptInput = {
  merchant: string;
  purchaseDate: string;
  totalCents: number;
  items: ReceiptItem[];
  answers: ReceiptAnswers;
  notes: string;
};
export type TaxReceipt = ReceiptInput & {
  id: string;
  assessmentYear: number;
  rulesVersion: string;
  fileMime: string;
  fileSize: number;
  revision: number;
  createdAt: string;
  deletedAt: string | null;
};
export type ItemAssessment = {
  category: Category | null;
  status: ReceiptStatus;
  eligibleCents: number;
  reasons: string[];
};
export type AssessedReceipt = TaxReceipt & {
  assessments: ItemAssessment[];
  status: ReceiptStatus;
  eligibleCents: number;
  estimatedClaimCents: number;
};
export const statusLabels: Record<ReceiptStatus, string> = {
  potentially_claimable: "Potentially claimable",
  needs_checking: "Needs checking",
  not_eligible: "Not eligible",
};
export const kindLabels: Record<PurchaseKind, string> = {
  unsure: "I'm not sure — help me check",
  books: "Books, journals or reading subscriptions",
  device: "Computer, smartphone or tablet",
  internet: "Internet subscription",
  course: "Personal learning / self-development course",
  sports_equipment: "Sports equipment",
  sports_facility: "Sports facility rental or entry",
  sports_competition: "Sports competition registration",
  sports_training: "Gym membership or sports training",
  other: "Something else (save for checking)",
};
export function money(cents: number) {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(cents / 100);
}
export function malaysiaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}
export function parseMoney(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 100_000_000 ? cents : null;
}
