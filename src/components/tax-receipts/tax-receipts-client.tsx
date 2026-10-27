"use client";

import Link from "next/link";
import { Download, FileText, HelpCircle, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { money, malaysiaToday, statusLabels } from "@/lib/tax-receipts/model";
import { buildYearSummary, categoryLabels, itemConditions, rulesForYear } from "@/lib/tax-receipts/rules";

type YearSummary = ReturnType<typeof buildYearSummary>;
const panel = "rounded-2xl border border-white/[0.08] bg-card p-4";
const control = "min-h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function TaxReceiptsClient({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<YearSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<"receipts" | "guide">("receipts");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [exportScope, setExportScope] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const currentYear = Number(malaysiaToday().slice(0, 4));
  const rules = rulesForYear(year);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/tax-receipts?year=${year}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load receipts.");
        if (!controller.signal.aborted) { setData(result); setLoadError(null); }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(navigator.onLine === false ? "You are offline. Reconnect to load your private receipts." : error instanceof TypeError || error instanceof SyntaxError ? "Unable to load receipts. Please try again." : error instanceof Error ? error.message : "Unable to load receipts.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [year, refresh]);

  function reload() { setLoading(true); setLoadError(null); setRefresh((value) => value + 1); }
  function changeYear(value: number) {
    setLoading(true); setLoadError(null); setActionError(null); setMessage(""); setData(null); setFilter("all");
    setYear(value); window.history.replaceState(window.history.state, "", `/tax-receipts?year=${value}`);
  }
  async function download(url: string, filename: string, key: string) {
    setBusy(key); setActionError(null); setMessage("");
    try {
      if (navigator.onLine === false) throw new Error("You are offline. Reconnect before downloading.");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Unable to download."); }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = href; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setMessage("Download started. Save the file to a safe place on your device.");
    } catch (error) {
      setActionError(error instanceof TypeError || error instanceof SyntaxError ? "The download could not be completed. Discard any incomplete file and try again." : error instanceof Error ? error.message : "Unable to download. Please try again.");
    } finally { setBusy(null); }
  }
  async function remove(id: string) {
    if (!window.confirm("Permanently delete this receipt and its original file? This cannot be undone.")) return;
    setBusy(id); setActionError(null); setMessage("");
    try {
      const response = await fetch(`/api/tax-receipts/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to delete receipt.");
      setMessage("Receipt and original file deleted.");
    } catch (error) {
      setActionError(error instanceof TypeError || error instanceof SyntaxError ? "Unable to confirm deletion. Reload and check the receipt before retrying." : error instanceof Error ? error.message : "Unable to delete receipt.");
    } finally { setBusy(null); reload(); }
  }
  const visible = data?.receipts.toReversed().filter((receipt) => {
    const matchesSearch = [receipt.merchant, receipt.notes, ...receipt.items.map((item) => item.description)].join(" ").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter === "all" || (filter === "claims" ? receipt.eligibleCents > 0 && !receipt.deletedAt : receipt.status === "needs_checking" && !receipt.deletedAt));
  }) ?? [];

  return <div className="space-y-5 px-5 py-5">
    <div className="flex items-end justify-between gap-3">
      <label className="text-xs font-semibold text-muted-foreground">Assessment year<select className={`${control} mt-1 block w-32 text-foreground`} value={year} disabled={busy !== null} onChange={(event) => changeYear(Number(event.target.value))}>{Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <Link href="/tax-receipts/new" className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"><Plus className="size-4" /> Save receipt</Link>
    </div>
    <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-300" /><p>Your receipts are private to your account. This helper estimates selected reliefs; amounts are not tax refunds or LHDN approval.</p></div>
    <div className="grid grid-cols-2 rounded-xl bg-white/[0.04] p-1" role="tablist" aria-label="Tax receipt views">
      <button type="button" role="tab" aria-selected={tab === "receipts"} aria-controls="tax-receipts-panel" id="tax-receipts-tab" onClick={() => setTab("receipts")} className={`min-h-11 rounded-lg text-sm font-semibold ${tab === "receipts" ? "bg-blue-600/20 text-blue-200" : "text-muted-foreground"}`}>My receipts</button>
      <button type="button" role="tab" aria-selected={tab === "guide"} aria-controls="tax-guide-panel" id="tax-guide-tab" onClick={() => setTab("guide")} className={`min-h-11 rounded-lg text-sm font-semibold ${tab === "guide" ? "bg-blue-600/20 text-blue-200" : "text-muted-foreground"}`}>What can I claim?</button>
    </div>
    {tab === "guide" ? <div id="tax-guide-panel" role="tabpanel" aria-labelledby="tax-guide-tab" className="space-y-4">
      <div className={panel}><h2 className="font-semibold">Start with the purchase</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">You don’t need to know a tax category. Save the receipt, describe what you bought, and use the suggested purchase types. Answer the checks—or choose Not sure and return later.</p></div>
      {!rules && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">This helper has not verified {year} rules. Receipts can be stored, but no relief amount is estimated for this year.</p>}
      <div className={panel}><h2 className="font-semibold">Lifestyle {rules && <span className="text-blue-300">· up to {money(rules.limits.lifestyle)}</span>}</h2><p className="mt-2 text-sm text-muted-foreground">For qualifying purchases benefiting you, your spouse or child.</p><ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li>Books and reading subscriptions.</li><li>Personal computers, smartphones and tablets; separate warranty add-ons and other items.</li><li>Internet service registered in your name.</li><li>Qualifying personal learning and self-development courses.</li></ul><p className="mt-3 text-xs leading-relaxed text-muted-foreground">All these purchases share one yearly Lifestyle limit. General shopping, streaming subscriptions and business costs do not automatically qualify.</p></div>
      <div className={panel}><h2 className="font-semibold">Sports {rules && <span className="text-blue-300">· up to {money(rules.limits.sports)}</span>}</h2><p className="mt-2 text-sm text-muted-foreground">A separate annual limit covers qualifying equipment, facility use, competition registration, and gym or training fees.</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">The sport, beneficiary and provider conditions matter. Ask the organiser or provider for registration details when needed. This helper will explain the specific check after you select a purchase type.</p></div>
      <div className={panel}><h2 className="flex items-center gap-2 font-semibold"><HelpCircle className="size-4" /> Unclear or another category?</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Save medical, childcare, insurance and other receipts as Needs checking. Those categories are not calculated yet; this does not mean the expense is ineligible. Keep any statements, certificates or supporting documents too.</p></div>
      <div className={panel}><h2 className="font-semibold">What the amounts mean</h2><dl className="mt-3 space-y-3 text-sm"><div><dt className="font-medium">Receipt total</dt><dd className="text-muted-foreground">The whole bill, including ordinary purchases.</dd></div><div><dt className="font-medium">Eligible before annual limit</dt><dd className="text-muted-foreground">Only the portions matching the conditions checked.</dd></div><div><dt className="font-medium">Estimated relief</dt><dd className="text-muted-foreground">The eligible total capped at the year’s category limit. Review claims recorded elsewhere and joint-assessment conditions before filing.</dd></div></dl></div>
      {rules && <a href={rules.source} target="_blank" rel="noreferrer" className="block text-sm text-blue-300 underline">Read the official {year} LHDN guidance</a>}
    </div> : <div id="tax-receipts-panel" role="tabpanel" aria-labelledby="tax-receipts-tab" className="space-y-5">
      {loading ? <div role="status" className="flex justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Loading your receipts…</div>
        : loadError ? <div role="alert" className={`${panel} space-y-3`}><p className="text-sm text-red-300">{loadError}</p><Button variant="outline" onClick={reload}>Try again</Button></div>
        : data && <>
          <div className="grid grid-cols-2 gap-3">
            <div className={panel}><p className="text-xs text-muted-foreground">Receipt totals</p><p className="mt-1 text-lg font-bold">{money(data.totalCents)}</p></div>
            <div className={`${panel} border-blue-500/20`}><p className="text-xs text-blue-200">Estimated relief</p><p className="mt-1 text-lg font-bold text-blue-200">{money(data.estimatedClaimCents)}</p></div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{money(data.eligibleCents)} eligible before annual limits · {data.needsChecking} receipt{data.needsChecking === 1 ? "" : "s"} need checking. Unknown and unsupported portions are excluded from the estimate.</p>
          {!rules && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">No verified rules for {year}. Your evidence is saved; receipts remain Needs checking.</p>}
          <div className="space-y-3">{data.categories.map((category) => <div key={category.key} className={panel}>
            <div className="flex justify-between gap-3 text-sm"><h2 className="font-semibold">{category.label}</h2><strong>{money(category.estimatedClaimCents)} <span className="font-normal text-muted-foreground">/ {category.limitCents === null ? "not verified" : money(category.limitCents)}</span></strong></div>
            {category.limitCents !== null && <progress className="mt-3 h-2 w-full accent-blue-500" max={category.limitCents} value={category.estimatedClaimCents} aria-label={`${category.label} relief used`} />}
            <p className="mt-2 text-xs text-muted-foreground">Eligible: {money(category.eligibleCents)} · Remaining: {category.remainingCents === null ? "—" : money(category.remainingCents)}{category.excessCents > 0 && ` · Over limit: ${money(category.excessCents)}`}</p>
          </div>)}</div>
          <div className={`${panel} space-y-3`}>
            <h2 className="font-semibold">Keep a copy on your device</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">Download originals, a category summary, receipt index and item explanations in one ZIP. Pending deletions are excluded.</p>
            <label className="block text-xs font-medium">Include<select className={`${control} mt-1 w-full`} value={exportScope} onChange={(event) => setExportScope(event.target.value)}><option value="all">All saved receipts (including Needs checking)</option><option value="claims">Receipts with a potentially claimable portion</option></select></label>
            <Button className="h-11 w-full" disabled={busy !== null} onClick={() => void download(`/api/tax-receipts/export?year=${year}&scope=${exportScope}`, `SplitHutang-tax-${year}-${exportScope}.zip`, "export")}>{busy === "export" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{busy === "export" ? "Preparing your evidence pack…" : `Download ${year}`}</Button>
          </div>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Saved receipts</h2><Button variant="ghost" disabled={busy !== null} onClick={reload} aria-label="Reload receipts"><RefreshCw className="size-4" /></Button></div>
          <label className="block text-xs font-medium">Search receipts<input className={`${control} mt-1 w-full`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Shop, item or note" /></label>
          <label className="block text-xs font-medium">Show<select className={`${control} mt-1 w-full`} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All receipts</option><option value="checking">Needs checking</option><option value="claims">Has potentially claimable portions</option></select></label>
          {visible.length === 0 ? <div className={`${panel} py-8 text-center`}><FileText className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">{data.receipts.length ? "No matching receipts" : `No receipts saved for ${year}`}</h3><p className="mt-2 text-xs text-muted-foreground">{data.receipts.length ? "Try another search or filter." : "Save a receipt even if you don’t know whether it qualifies."}</p></div> : visible.map((receipt) => <article key={receipt.id} className={`${panel} space-y-3`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{receipt.merchant}</h3><p className="mt-1 text-xs text-muted-foreground">Paid {receipt.purchaseDate} · YA {receipt.assessmentYear}</p></div><span className={`max-w-36 rounded-full px-2.5 py-1 text-center text-[10px] font-semibold ${receipt.deletedAt ? "bg-red-500/10 text-red-300" : receipt.status === "potentially_claimable" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>{receipt.deletedAt ? "Deletion pending" : statusLabels[receipt.status]}</span></div>
            <dl className="space-y-1 text-xs"><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Full receipt total</dt><dd>{money(receipt.totalCents)}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Eligible before annual limit</dt><dd>{money(receipt.eligibleCents)}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Estimated relief after limit</dt><dd className="font-semibold text-blue-200">{money(receipt.estimatedClaimCents)}</dd></div></dl>
            {!receipt.deletedAt && <details className="rounded-xl bg-white/[0.03] p-3"><summary className="cursor-pointer text-xs font-semibold">Why this result / what to check</summary><div className="mt-3 space-y-3">{receipt.items.map((item, i) => <div key={i} className="text-xs leading-relaxed"><p className="font-medium">{item.description || `Portion ${i + 1}`} · {money(item.amountCents)}</p><p className="mt-1 text-muted-foreground">{receipt.assessments[i].category ? categoryLabels[receipt.assessments[i].category!] : "Unclassified"} · {statusLabels[receipt.assessments[i].status]}</p><p className="mt-1 text-muted-foreground">{receipt.assessments[i].reasons.join(" ")}</p>{item.kind !== "unsure" && item.kind !== "other" && <p className="mt-1 text-muted-foreground">{itemConditions[item.kind].explanation}</p>}</div>)}{receipt.notes && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">Note: {receipt.notes}</p>}<p className="text-[10px] text-muted-foreground">Checked with rule version {receipt.rulesVersion}. Annual limits are shared across your receipts.</p></div></details>}
            <div className="flex flex-wrap items-center gap-2">
              {!receipt.deletedAt && <><Link href={`/tax-receipts/${receipt.id}/edit`} className="flex min-h-10 items-center rounded-lg border border-white/10 px-3 text-xs font-semibold">Check / edit</Link><Button variant="outline" disabled={busy !== null} onClick={() => void download(`/api/tax-receipts/${receipt.id}/file`, `receipt-${receipt.purchaseDate}-${receipt.id}.${receipt.fileMime === "application/pdf" ? "pdf" : receipt.fileMime === "image/jpeg" ? "jpg" : receipt.fileMime.split("/")[1]}`, receipt.id)}><Download className="size-4" /> Receipt</Button></>}
              <Button variant="ghost" disabled={busy !== null} aria-label={`Delete receipt from ${receipt.merchant}`} onClick={() => void remove(receipt.id)}><Trash2 className="size-4" />{receipt.deletedAt ? "Retry deletion" : "Delete"}</Button>
            </div>
          </article>)}
          {rules && <a href={rules.source} target="_blank" rel="noreferrer" className="block text-xs text-blue-300 underline">{rules.reference}</a>}
        </>}
    </div>}
    {actionError && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{actionError}</p>}
    <p role="status" aria-live="polite" className="text-xs text-emerald-300">{message}</p>
    <p className="text-[11px] leading-relaxed text-muted-foreground">Keep receipts and supporting records for the required retention period. LHDN’s individual FAQ describes seven years from the end of the year the return was submitted. <a className="underline" href="https://www.hasil.gov.my/individu/soalan-lazim-individu/" target="_blank" rel="noreferrer">Read the guidance</a></p>
  </div>;
}
