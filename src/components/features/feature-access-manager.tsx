"use client";

import { LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { restrictedFeatures, type FeatureAccessUser, type FeatureKey } from "@/lib/features/catalog";

export function FeatureAccessManager() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [users, setUsers] = useState<FeatureAccessUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ query, page: String(page) });
    async function load() {
      try {
        const response = await fetch(`/api/admin/feature-access?${params}`, {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load users.");
        if (!controller.signal.aborted) {
          setUsers(result.users);
          setHasMore(result.hasMore);
          setLoadError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(navigator.onLine === false
            ? "You are offline. Reconnect and try again."
            : error instanceof Error ? error.message : "Unable to load users. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [query, page, retry]);

  function startLoad() {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setMessage("");
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startLoad();
    setQuery(input.trim());
    setPage(0);
    setRetry((value) => value + 1);
  }

  async function changeAccess(user: FeatureAccessUser, featureKey: FeatureKey, enabled: boolean) {
    setSaving(`${user.userId}:${featureKey}`);
    setSaveError(null);
    setMessage("");
    try {
      const response = await fetch("/api/admin/feature-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, featureKey, enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save access.");
      setUsers((current) => current.map((row) => row.userId === user.userId ? {
        ...row,
        featureKeys: enabled
          ? [...new Set([...row.featureKeys, featureKey])]
          : row.featureKeys.filter((key) => key !== featureKey),
      } : row));
      const label = restrictedFeatures.find((feature) => feature.key === featureKey)?.label;
      setMessage(`${user.displayName}: ${label} access ${enabled ? "granted" : "revoked"}.`);
    } catch (error) {
      setSaveError(navigator.onLine === false
        ? "You are offline. Reconnect and reload users to check whether access was saved."
        : error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError)
          ? error.message : "Unable to confirm the change. Reload users to check access, then try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="space-y-5 px-5 py-5">
      <div className="flex gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-300" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">You control access</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Restricted features are off by default. Changes save immediately. Removing access keeps any saved feature data. Your creator account always has access.
          </p>
        </div>
      </div>

      <form onSubmit={search} className="space-y-2">
        <label htmlFor="feature-user-search" className="text-sm font-semibold">Find a registered user</label>
        <div className="flex gap-2">
          <input id="feature-user-search" type="search" maxLength={100}
            placeholder="Name or email" value={input}
            onChange={(event) => setInput(event.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <Button type="submit" disabled={loading || saving !== null} className="h-11 px-4">
            <Search className="size-4" /> Search
          </Button>
        </div>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {message && <p className="text-sm text-emerald-300">{message}</p>}
      </div>
      {saveError && (
        <div role="alert" className="space-y-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-sm text-red-300">{saveError}</p>
          <Button variant="outline" disabled={loading || saving !== null} onClick={() => { startLoad(); setRetry((value) => value + 1); }}>Reload users</Button>
        </div>
      )}

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" /> Loading users…
        </div>
      ) : loadError ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-red-500/20 p-4">
          <p className="text-sm text-red-300">{loadError}</p>
          <Button variant="outline" onClick={() => { startLoad(); setRetry((value) => value + 1); }}>Try again</Button>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-border p-6 text-center">
          <p className="text-sm font-semibold">No users found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try another name or email. The person must have a SplitHutang account.</p>
        </div>
      ) : (
        <div className="space-y-3" aria-busy={saving !== null}>
          {users.map((user) => (
            <article key={user.userId} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
              <div className="border-b border-white/[0.05] px-4 py-3">
                <p className="break-words text-sm font-semibold">{user.displayName}
                  {user.isOwner && <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300">Creator</span>}
                </p>
                <p className="mt-0.5 break-all text-xs text-muted-foreground">{user.email ?? "No email address"}</p>
              </div>
              {restrictedFeatures.map((feature) => {
                const pending = saving === `${user.userId}:${feature.key}`;
                return (
                  <label key={feature.key} className="flex min-h-16 items-center gap-3 px-4 py-4">
                    <input type="checkbox" className="size-5 shrink-0 accent-blue-500"
                      aria-label={`${feature.label} access for ${user.displayName} (${user.email ?? "no email"})`}
                      checked={user.isOwner || user.featureKeys.includes(feature.key)}
                      disabled={user.isOwner || saving !== null}
                      onChange={(event) => void changeAccess(user, feature.key, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{feature.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{feature.description}</span>
                    </span>
                    {pending && <LoaderCircle aria-label="Saving access" className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                  </label>
                );
              })}
            </article>
          ))}
        </div>
      )}

      {!loading && !loadError && (page > 0 || hasMore) && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page === 0 || saving !== null} onClick={() => { startLoad(); setPage((value) => value - 1); }}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" disabled={!hasMore || saving !== null} onClick={() => { startLoad(); setPage((value) => value + 1); }}>Next</Button>
        </div>
      )}
    </section>
  );
}
