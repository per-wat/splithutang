"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type ResetPasswordFormProps = {
  nextPath: string;
};

export function ResetPasswordForm({ nextPath }: ResetPasswordFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    /*
     * A recovery link creates a temporary authenticated session. End every
     * session after the password changes so the user signs in again with the
     * new password on each device.
     */
    await supabase.auth.signOut({ scope: "global" });

    const loginUrl = new URL("/login", window.location.origin);
    loginUrl.searchParams.set("reset", "success");

    if (nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
    }

    router.replace(`${loginUrl.pathname}${loginUrl.search}`);
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-600/10">
          <KeyRound className="size-6 text-blue-400" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Create a new password</h1>

          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Choose a password you haven&apos;t used for SplitHutang before.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="new-password"
            className="text-sm font-medium"
          >
            New password
          </label>

          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            autoFocus
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-blue-500"
          />

          <p className="text-[11px] text-muted-foreground">
            Minimum 8 characters.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="confirm-new-password"
            className="text-sm font-medium"
          >
            Confirm new password
          </label>

          <input
            id="confirm-new-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-blue-500"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-sm leading-relaxed text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || !confirmPassword}
          className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {loading ? "Updating password..." : "Update password"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Remembered your password?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
