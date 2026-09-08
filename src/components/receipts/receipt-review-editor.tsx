"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CirclePlus,
  Trash2,
} from "lucide-react";

import {
  buildReceiptReviewDraft,
  calculateReceiptReviewItemTotal,
  countUnacknowledgedReceiptReviewFields,
  getReceiptReviewDifference,
  validateReceiptReviewDraft,
  type ReceiptReviewDraft,
  type ReceiptReviewDraftItem,
  type ReceiptReviewField,
  type ReceiptReviewItemKind,
} from "@/lib/receipts/build-receipt-review-draft";
import type { ReceiptItemMatchResult } from "@/lib/receipts/match-receipt-items";
import type { ParsedReceiptSummary } from "@/lib/receipts/parse-receipt-summary";

type ReceiptReviewEditorProps = {
  summary: ParsedReceiptSummary;
  matchResult: ReceiptItemMatchResult;
  onConfirm?: (draft: ReceiptReviewDraft) => void;
};

type SummaryFieldName =
  | "merchant"
  | "receiptDate"
  | "receiptTime"
  | "expectedAmount";

const INPUT_CLASS_NAME =
  "mt-1.5 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20";

function getDefaultParentId(
  items: ReceiptReviewDraftItem[],
  itemIndex: number,
) {
  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const candidate = items[index];

    if (candidate?.kind === "item") {
      return candidate.id;
    }
  }

  return items.find((item) => item.kind === "item")?.id ?? null;
}

function ReviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300">
      <AlertTriangle className="size-3" />
      Check
    </span>
  );
}

export function ReceiptReviewEditor({
  summary,
  matchResult,
  onConfirm,
}: ReceiptReviewEditorProps) {
  const nextItemIdRef = useRef(matchResult.items.length + 1);
  const [draft, setDraft] = useState(() =>
    buildReceiptReviewDraft(summary, matchResult),
  );
  const [isConfirmed, setIsConfirmed] = useState(false);

  const issues = useMemo(() => validateReceiptReviewDraft(draft), [draft]);
  const itemTotal = useMemo(
    () => calculateReceiptReviewItemTotal(draft),
    [draft],
  );
  const difference = useMemo(() => getReceiptReviewDifference(draft), [draft]);
  const unacknowledgedCount = useMemo(
    () => countUnacknowledgedReceiptReviewFields(draft),
    [draft],
  );

  const issuesByItem = useMemo(() => {
    const result = new Map<string, string[]>();

    for (const issue of issues) {
      if (!issue.itemId) {
        continue;
      }

      const existing = result.get(issue.itemId) ?? [];
      existing.push(issue.message);
      result.set(issue.itemId, existing);
    }

    return result;
  }, [issues]);

  const generalIssues = issues.filter((issue) => !issue.itemId);
  const canConfirm = issues.length === 0 && unacknowledgedCount === 0;

  function updateSummaryField(fieldName: SummaryFieldName, value: string) {
    setIsConfirmed(false);
    setDraft((current) => ({
      ...current,
      [fieldName]: {
        ...current[fieldName],
        value,
        acknowledged: true,
      } satisfies ReceiptReviewField,
    }));
  }

  function acknowledgeSummaryField(fieldName: SummaryFieldName) {
    setDraft((current) => ({
      ...current,
      [fieldName]: {
        ...current[fieldName],
        acknowledged: true,
      } satisfies ReceiptReviewField,
    }));
  }

  function updateItem(
    itemId: string,
    update: (
      item: ReceiptReviewDraftItem,
      index: number,
    ) => ReceiptReviewDraftItem,
  ) {
    setIsConfirmed(false);
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, index) =>
        item.id === itemId
          ? { ...update(item, index), acknowledged: true }
          : item,
      ),
    }));
  }

  function updateItemKind(itemId: string, kind: ReceiptReviewItemKind) {
    updateItem(itemId, (item, itemIndex) => ({
      ...item,
      kind,
      parentId:
        kind === "addon" ? getDefaultParentId(draft.items, itemIndex) : null,
    }));
  }

  function addItem() {
    const id = `manual-receipt-item-${nextItemIdRef.current}`;
    nextItemIdRef.current += 1;
    setIsConfirmed(false);
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id,
          sourceSequence: null,
          name: "",
          quantity: "1",
          amount: "",
          kind: "item",
          parentId: null,
          confidence: null,
          needsReview: false,
          acknowledged: true,
          reviewReasons: [],
        },
      ],
    }));
  }

  function removeItem(itemId: string) {
    setIsConfirmed(false);
    setDraft((current) => ({
      ...current,
      items: current.items
        .filter((item) => item.id !== itemId)
        .map((item) =>
          item.parentId === itemId ? { ...item, parentId: null } : item,
        ),
    }));
  }

  function markEverythingChecked() {
    setDraft((current) => ({
      ...current,
      merchant: { ...current.merchant, acknowledged: true },
      receiptDate: { ...current.receiptDate, acknowledged: true },
      receiptTime: { ...current.receiptTime, acknowledged: true },
      expectedAmount: { ...current.expectedAmount, acknowledged: true },
      items: current.items.map((item) => ({
        ...item,
        acknowledged: true,
      })),
    }));
  }

  function confirmDraft() {
    if (!canConfirm) {
      return;
    }

    onConfirm?.(draft);
    setIsConfirmed(true);
  }

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-zinc-100">Review scanned receipt</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Correct the OCR result before it becomes an expense draft.
          </p>
        </div>

        {unacknowledgedCount > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
            {unacknowledgedCount} to check
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <Check className="size-3" /> Checked
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-400 sm:col-span-2">
          <span className="flex items-center justify-between gap-2">
            Merchant
            {draft.merchant.needsReview && !draft.merchant.acknowledged && (
              <button
                type="button"
                onClick={() => acknowledgeSummaryField("merchant")}
                aria-label="Mark merchant as checked"
              >
                <ReviewBadge />
              </button>
            )}
          </span>
          <input
            type="text"
            value={draft.merchant.value}
            onChange={(event) =>
              updateSummaryField("merchant", event.target.value)
            }
            placeholder="Merchant name"
            className={INPUT_CLASS_NAME}
          />
        </label>

        <label className="text-xs font-medium text-zinc-400">
          <span className="flex items-center justify-between gap-2">
            Receipt date
            {draft.receiptDate.needsReview &&
              !draft.receiptDate.acknowledged && (
                <button
                  type="button"
                  onClick={() => acknowledgeSummaryField("receiptDate")}
                  aria-label="Mark receipt date as checked"
                >
                  <ReviewBadge />
                </button>
              )}
          </span>
          <input
            type="date"
            value={draft.receiptDate.value}
            onChange={(event) =>
              updateSummaryField("receiptDate", event.target.value)
            }
            className={INPUT_CLASS_NAME}
          />
        </label>

        <label className="text-xs font-medium text-zinc-400">
          <span className="flex items-center justify-between gap-2">
            Receipt time
            {draft.receiptTime.needsReview &&
              !draft.receiptTime.acknowledged && (
                <button
                  type="button"
                  onClick={() => acknowledgeSummaryField("receiptTime")}
                  aria-label="Mark receipt time as checked"
                >
                  <ReviewBadge />
                </button>
              )}
          </span>
          <input
            type="time"
            value={draft.receiptTime.value}
            onChange={(event) =>
              updateSummaryField("receiptTime", event.target.value)
            }
            className={INPUT_CLASS_NAME}
          />
        </label>

        <label className="text-xs font-medium text-zinc-400 sm:col-span-2">
          <span className="flex items-center justify-between gap-2">
            Item-total target
            {draft.expectedAmount.needsReview &&
              !draft.expectedAmount.acknowledged && (
                <button
                  type="button"
                  onClick={() => acknowledgeSummaryField("expectedAmount")}
                  aria-label="Mark item-total target as checked"
                >
                  <ReviewBadge />
                </button>
              )}
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-zinc-500">
              RM
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.expectedAmount.value}
              onChange={(event) =>
                updateSummaryField("expectedAmount", event.target.value)
              }
              placeholder="0.00"
              className={`${INPUT_CLASS_NAME} pl-10`}
            />
          </div>
          <span className="mt-1.5 block font-normal text-zinc-600">
            {draft.expectedAmountSource
              ? `Detected from receipt ${draft.expectedAmountSource}.`
              : "Enter the amount that the item lines should reconcile to."}
          </span>
        </label>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-zinc-200">Items</h4>
          <p className="mt-1 text-xs text-zinc-600">
            Amount means the full printed line total.
          </p>
        </div>

        <button
          type="button"
          onClick={addItem}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-800 px-3 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
        >
          <CirclePlus className="size-4" />
          Add item
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {draft.items.map((item, itemIndex) => {
          const itemIssues = issuesByItem.get(item.id) ?? [];
          const mainItems = draft.items.filter(
            (candidate) =>
              candidate.kind === "item" && candidate.id !== item.id,
          );

          return (
            <article
              key={item.id}
              className={`rounded-2xl border p-3 ${
                item.needsReview && !item.acknowledged
                  ? "border-amber-500/30 bg-amber-500/[0.04]"
                  : "border-zinc-800 bg-zinc-900/70"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400">
                    {itemIndex + 1}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {item.kind === "addon" ? "Add-on" : "Item"}
                  </span>
                  {item.confidence !== null && (
                    <span className="text-xs text-zinc-600">
                      {item.confidence}% OCR
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {item.needsReview && !item.acknowledged && (
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, (current) => current)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10"
                    >
                      Mark checked
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
                    aria-label={`Remove ${item.name || `item ${itemIndex + 1}`}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-xs font-medium text-zinc-500">
                  Name
                  <input
                    type="text"
                    value={item.name}
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Item name"
                    className={INPUT_CLASS_NAME}
                  />
                </label>

                <label className="text-xs font-medium text-zinc-500">
                  Type
                  <select
                    value={item.kind}
                    onChange={(event) =>
                      updateItemKind(
                        item.id,
                        event.target.value as ReceiptReviewItemKind,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                  >
                    <option value="item">Main item</option>
                    <option value="addon">Add-on</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-zinc-500">
                  Quantity
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    className={INPUT_CLASS_NAME}
                  />
                </label>

                <label className="col-span-2 text-xs font-medium text-zinc-500">
                  Line total
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-zinc-500">
                      RM
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.amount}
                      onChange={(event) =>
                        updateItem(item.id, (current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      placeholder={
                        item.kind === "addon" ? "Included in parent" : "0.00"
                      }
                      className={`${INPUT_CLASS_NAME} pl-10`}
                    />
                  </div>
                </label>

                {item.kind === "addon" && (
                  <label className="col-span-2 text-xs font-medium text-zinc-500">
                    Parent item
                    <select
                      value={item.parentId ?? ""}
                      onChange={(event) =>
                        updateItem(item.id, (current) => ({
                          ...current,
                          parentId: event.target.value || null,
                        }))
                      }
                      className={INPUT_CLASS_NAME}
                    >
                      <option value="">Choose parent item</option>
                      {mainItems.map((mainItem, mainIndex) => (
                        <option
                          key={mainItem.id}
                          value={mainItem.id}
                        >
                          {mainIndex + 1}. {mainItem.name || "Unnamed item"}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1.5 block font-normal text-zinc-600">
                      Leave the line total empty when its price is included in
                      the parent item.
                    </span>
                  </label>
                )}
              </div>

              {item.needsReview &&
                !item.acknowledged &&
                item.reviewReasons.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-amber-500/10 pt-3 text-xs leading-5 text-amber-200/80">
                    {item.reviewReasons.map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                )}

              {itemIssues.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs leading-5 text-red-300">
                  {itemIssues.map((issue) => (
                    <li key={issue}>• {issue}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Calculated item total</span>
          <span className="font-semibold text-zinc-100">
            RM{itemTotal.toFixed(2)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-zinc-500">Difference</span>
          <span
            className={
              difference !== null && Math.abs(difference) <= 0.02
                ? "font-medium text-emerald-400"
                : "font-medium text-amber-300"
            }
          >
            {difference === null
              ? "Needs target"
              : `${difference < 0 ? "-" : difference > 0 ? "+" : ""}RM${Math.abs(
                  difference,
                ).toFixed(2)}`}
          </span>
        </div>
      </div>

      {generalIssues.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs font-medium text-red-300">
            Fix before confirming
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-red-200/80">
            {generalIssues.map((issue) => (
              <li key={issue.code}>• {issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {unacknowledgedCount > 0 && (
        <button
          type="button"
          onClick={markEverythingChecked}
          className="mt-4 w-full rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/15"
        >
          Mark {unacknowledgedCount} flagged field
          {unacknowledgedCount === 1 ? "" : "s"} as checked
        </button>
      )}

      <button
        type="button"
        onClick={confirmDraft}
        disabled={!canConfirm}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CheckCircle2 className="size-5" />
        Confirm reviewed receipt
      </button>

      {isConfirmed && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p>
            Receipt draft confirmed. It is ready for the Add Expense integration
            stage.
          </p>
        </div>
      )}
    </section>
  );
}
