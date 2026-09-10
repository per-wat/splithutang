"use client";

import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const nextPath = getSafeNext(searchParams.get("next"));
  const invalidLink = searchParams.get("error") === "invalid-link";
  const loginHref =
    nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setLoading(true);

    const resetPage =
      nextPath === "/"
        ? "/reset-password"
        : `/reset-password?next=${encodeURIComponent(nextPath)}`;
    const callbackUrl = new URL("/auth/callback", window.location.origin);

    callbackUrl.searchParams.set("next", resetPage);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: callbackUrl.toString(),
      },
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    /*
     * Keep the message deliberately generic. Supabase also returns success
     * when an address has no account, which prevents account enumeration.
     */
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm">
        <Link
          href={loginHref}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>

        {sent ? (
          <div className="space-y-5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <MailCheck className="size-6 text-emerald-400" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold">Check your email</h1>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If an account exists for {email.trim()}, we sent it a password
                reset link.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-card p-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                The link expires after a short time. Check your spam folder if
                you don&apos;t see the email.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSent(false);
                setError("");
              }}
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-card text-sm font-semibold transition-colors hover:bg-white/[0.06]"
            >
              Try another email
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <h1 className="text-2xl font-semibold">Reset password</h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a secure reset link.
              </p>
            </div>

            {invalidLink && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-sm leading-relaxed text-amber-400">
                  This reset link is invalid or has expired. Request a new one
                  below.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="reset-email"
                className="text-sm font-medium"
              >
                Email
              </label>

              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                autoFocus
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
              disabled={loading || !email.trim()}
              className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {loading ? "Sending reset link..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
