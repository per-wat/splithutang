"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { answers, beneficiaries, kindLabels, malaysiaToday, money, parseMoney, purchaseKinds, statusLabels, type Answer, type ReceiptAnswers, type ReceiptItem, type TaxReceipt } from "@/lib/tax-receipts/model";
import { assessReceipt, itemConditions, rulesForYear, rulesVersionForYear, suggestKinds } from "@/lib/tax-receipts/rules";
import { MAX_RECEIPT_BYTES, parseReceiptInput } from "@/lib/tax-receipts/validation";

const field = "mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const answerLabels: Record<Answer, string> = { yes: "Yes", no: "No", unsure: "Not sure yet" };
const beneficiaryLabels = { self: "Me", spouse: "My spouse", child: "My child", parent: "My parent", other: "Someone else", unsure: "Not sure yet" };
type DraftItem = Omit<ReceiptItem, "amountCents"> & { amount: string };
const newItem = (): DraftItem => ({ kind: "unsure", description: "", amount: "", beneficiary: "unsure", conditionMet: "unsure", parentResident: "unsure" });

export function AnswerField({ label, explanation, value, onChange }: { label: string; explanation?: string; value: Answer; onChange: (value: Answer) => void }) {
  return <label className="block text-sm font-medium">{label}
    {explanation && <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{explanation}</span>}
    <select className={field} value={value} onChange={(event) => onChange(event.target.value as Answer)}>
      {answers.map((answer) => <option key={answer} value={answer}>{answerLabels[answer]}</option>)}
    </select>
  </label>;
}

export function ReceiptForm({ initialReceipt }: { initialReceipt?: TaxReceipt }) {
  const router = useRouter();
  const [merchant, setMerchant] = useState(initialReceipt?.merchant ?? "");
  const [date, setDate] = useState(initialReceipt?.purchaseDate ?? malaysiaToday());
  const [total, setTotal] = useState(initialReceipt ? (initialReceipt.totalCents / 100).toFixed(2) : "");
  const [items, setItems] = useState<DraftItem[]>(initialReceipt?.items.map(({ amountCents, ...item }) => ({ ...item, amount: (amountCents / 100).toFixed(2) })) ?? [newItem()]);
  const [receiptAnswers, setReceiptAnswers] = useState<ReceiptAnswers>(initialReceipt?.answers ?? { resident: "unsure", ownExpense: "unsure", claimOnce: "unsure" });
  const [notes, setNotes] = useState(initialReceipt?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedYear, setSavedYear] = useState<number | null>(null);
  const year = Number(date.slice(0, 4));
  const rules = rulesForYear(year);
  const input = { merchant, purchaseDate: date, totalCents: parseMoney(total) ?? 0, items: items.map(({ amount, ...item }) => ({ ...item, amountCents: parseMoney(amount) ?? 0 })), answers: receiptAnswers, notes };
  const assessments = assessReceipt(input, rulesVersionForYear(year));
  const eligible = assessments.reduce((sum, result) => sum + result.eligibleCents, 0);
  const portionTotal = input.items.reduce((sum, item) => sum + item.amountCents, 0);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (navigator.onLine === false) { setError("You are offline. Keep this page open and reconnect before saving."); return; }
    try {
      if (parseMoney(total) === null || items.some((item) => item.amount !== "" && parseMoney(item.amount) === null)) throw new Error("Enter amounts with up to two decimal places.");
      const parsed = parseReceiptInput(input);
      if (!initialReceipt && (!file || file.size > MAX_RECEIPT_BYTES || file.size === 0)) throw new Error("Choose a JPG, PNG, WebP or PDF receipt up to 3 MB.");
      setSaving(true);
      let response: Response;
      if (initialReceipt) {
        response = await fetch(`/api/tax-receipts/${initialReceipt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parsed, revision: initialReceipt.revision }) });
      } else {
        const form = new FormData(); form.set("details", JSON.stringify(parsed)); form.set("file", file!);
        response = await fetch("/api/tax-receipts", { method: "POST", body: form });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save receipt.");
      setSavedYear(result.receipt.assessmentYear);
      router.replace(`/tax-receipts?year=${result.receipt.assessmentYear}`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError || failure instanceof SyntaxError
        ? "Unable to confirm the save. Keep this page open, reconnect, and check My receipts before retrying."
        : failure instanceof Error ? failure.message : "Unable to save this receipt. Please try again.");
    } finally { setSaving(false); }
  }

  return <form onSubmit={save} className="space-y-6 px-5 py-5">
    <p className="text-sm leading-relaxed text-muted-foreground">Save your evidence now. You can leave answers as Not sure and return later; uncertain items stay out of the estimate.</p>
    <fieldset disabled={saving || savedYear !== null} className="space-y-5 disabled:opacity-70">
      {!initialReceipt && <label className="block rounded-2xl border border-dashed border-blue-500/40 bg-blue-500/[0.05] p-4 text-sm font-semibold">
        <span className="flex items-center gap-2"><Upload className="size-4 text-blue-300" /> Receipt photo or PDF</span>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">JPG, PNG, WebP or PDF · up to 3 MB. Use a PDF for multiple pages.</span>
        <input className="mt-3 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {file && <span className="mt-2 block break-all text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
      </label>}
      <label className="block text-sm font-medium">Shop / provider<input className={field} value={merchant} onChange={(event) => setMerchant(event.target.value)} maxLength={120} required placeholder="e.g. bookstore or internet provider" /></label>
      <label className="block text-sm font-medium">Date paid<input className={field} type="date" value={date} onChange={(event) => setDate(event.target.value)} min="2000-01-01" max={malaysiaToday()} required />
        <span className="mt-2 block text-xs text-muted-foreground">Assessment year: {Number.isFinite(year) ? year : "—"}. Use the payment date, even when uploading an older receipt.</span>
      </label>
      {!rules && <p className="rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">This year’s rules are not verified here. You can still save the receipt as Needs checking. Current-year rules will not be applied to it.</p>}
      <label className="block text-sm font-medium">Full receipt total (RM)<input className={field} inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="0.00" required />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">The entire bill, including items that may not qualify.</span>
      </label>
      <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-card p-4">
        <h2 className="font-semibold">A few checks for this receipt</h2>
        <AnswerField label={`Were you a Malaysian tax resident in ${year || "this year"}?`} explanation="Tax residency depends on your circumstances, including time in Malaysia—not just citizenship. Choose Not sure if you need to check." value={receiptAnswers.resident} onChange={(resident) => setReceiptAnswers({ ...receiptAnswers, resident })} />
        <AnswerField label="Do the portions below include only costs you personally bore?" explanation="Exclude employer / insurance reimbursements, refunds and other people's shares. You can enter a smaller amount than the receipt total." value={receiptAnswers.ownExpense} onChange={(ownExpense) => setReceiptAnswers({ ...receiptAnswers, ownExpense })} />
        <AnswerField label="Will these portions be claimed only once?" explanation="Check that they are not also claimed by your spouse or under another category. Joint assessment may need a combined review." value={receiptAnswers.claimOnce} onChange={(claimOnce) => setReceiptAnswers({ ...receiptAnswers, claimOnce })} />
      </div>
      <div className="space-y-4">
        <div><h2 className="font-semibold">Which parts might qualify?</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Split a mixed receipt into separate portions. Leave out ordinary purchases. All portions together must stay within the full total.</p></div>
        {items.map((item, index) => {
          const suggestions = item.kind === "unsure" ? suggestKinds(item.description) : [];
          const assessment = assessments[index];
          return <div key={index} className="space-y-4 rounded-2xl border border-white/[0.08] bg-card p-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Portion {index + 1}</h3>{items.length > 1 && <Button type="button" variant="ghost" aria-label={`Remove portion ${index + 1}`} onClick={() => setItems(items.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>}</div>
            <label className="block text-sm">What did you buy?<input className={field} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} maxLength={160} placeholder="e.g. laptop, books, badminton court" /></label>
            {suggestions.length > 0 && <div className="space-y-2"><p className="text-xs text-muted-foreground">Possible matches—choose one to check its conditions:</p><div className="flex flex-wrap gap-2">{suggestions.map((kind) => <Button key={kind} type="button" variant="outline" className="h-auto whitespace-normal py-2 text-left text-xs" onClick={() => updateItem(index, { kind, conditionMet: "unsure" })}>{kindLabels[kind]}</Button>)}</div></div>}
            <label className="block text-sm">Purchase type<select className={field} value={item.kind} onChange={(event) => updateItem(index, { kind: event.target.value as ReceiptItem["kind"], conditionMet: "unsure" })}>{purchaseKinds.map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select></label>
            <label className="block text-sm">Amount to check for this portion (RM)<input className={field} inputMode="decimal" value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} placeholder="0.00" /><span className="mt-1 block text-xs text-muted-foreground">Enter the potentially eligible portion, before the annual limit. Leave blank if you need to check the amount.</span></label>
            <label className="block text-sm">Who benefits?<select className={field} value={item.beneficiary} onChange={(event) => updateItem(index, { beneficiary: event.target.value as ReceiptItem["beneficiary"] })}>{beneficiaries.map((beneficiary) => <option key={beneficiary} value={beneficiary}>{beneficiaryLabels[beneficiary]}</option>)}</select></label>
            {item.kind.startsWith("sports_") && item.beneficiary === "parent" && <AnswerField label="Was your parent a Malaysian tax resident in this assessment year?" value={item.parentResident} onChange={(parentResident) => updateItem(index, { parentResident })} />}
            {item.kind !== "unsure" && item.kind !== "other" ? <AnswerField label={itemConditions[item.kind].question} explanation={itemConditions[item.kind].explanation} value={item.conditionMet} onChange={(conditionMet) => updateItem(index, { conditionMet })} /> : <p className="text-xs leading-relaxed text-muted-foreground">{itemConditions[item.kind].explanation}</p>}
            <div className="rounded-xl bg-white/[0.03] p-3" aria-live="polite"><p className={`text-xs font-semibold ${assessment.status === "potentially_claimable" ? "text-emerald-300" : assessment.status === "needs_checking" ? "text-amber-200" : "text-zinc-300"}`}>{statusLabels[assessment.status]}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{assessment.reasons.join(" ")}</p></div>
          </div>;
        })}
        {items.length < 20 && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setItems([...items, newItem()])}><Plus className="size-4" /> Add another portion</Button>}
      </div>
      <label className="block text-sm font-medium">Notes / what to check later<textarea className={field} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="e.g. ask provider for registration details" /></label>
      <div className="space-y-2 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-sm">
        <p className="flex justify-between gap-3"><span>Full receipt total</span><strong>{money(input.totalCents)}</strong></p>
        <p className="flex justify-between gap-3"><span>Portions being checked</span><strong>{money(portionTotal)}</strong></p>
        <p className="flex justify-between gap-3"><span>Eligible before annual limit</span><strong className="text-emerald-300">{money(eligible)}</strong></p>
        {portionTotal > input.totalCents && <p className="text-xs text-red-300">The portions exceed the receipt total.</p>}
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">Only portions meeting the checked conditions contribute. Your yearly overview applies the shared category limits across all receipts. These amounts are relief estimates, not refunds.</p>
      </div>
    </fieldset>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {savedYear !== null ? <p role="status" className="text-sm text-emerald-300">Receipt saved. <Link className="underline" href={`/tax-receipts?year=${savedYear}`}>Open your yearly overview</Link></p> : <Button type="submit" className="h-12 w-full" disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{saving ? "Saving receipt…" : initialReceipt ? "Save changes and recheck" : "Save receipt"}</Button>}
    <Link className="block text-center text-sm text-muted-foreground underline" href={`/tax-receipts?year=${Number.isFinite(year) ? year : malaysiaToday().slice(0, 4)}`}>Back to my receipts</Link>
  </form>;
}
