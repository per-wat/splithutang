"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function SignupForm() {
  const router = useRouter();

  const searchParams = useSearchParams();

  const supabase = useMemo(() => createClient(), []);

  const nextPath = getSafeNext(searchParams.get("next"));

  const loginHref =
    nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;

  const [displayName, setDisplayName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [loading, setLoading] = useState(false);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = displayName.trim();

    if (!cleanName) {
      setError("Please enter your name.");

      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),

      password,

      options: {
        data: {
          display_name: cleanName,
        },
      },
    });

    if (error) {
      setError(error.message);

      setLoading(false);
      return;
    }

    /*
     * Email confirmation disabled:
     *
     * Supabase gives us a session
     * immediately.
     */
    if (data.session) {
      router.push(nextPath);

      router.refresh();
      return;
    }

    /*
     * Email confirmation enabled.
     */
    setSuccess(
      "Account created. Confirm your email, then sign in to continue.",
    );

    setLoading(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">Create account</h1>

          <p className="mt-1 text-sm text-muted-foreground">Join SplitHutang</p>

          {nextPath.startsWith("/invite/") && (
            <p className="mt-2 text-xs text-blue-400">
              Create your account to accept the group invitation.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="displayName"
            className="text-sm font-medium"
          >
            Name
          </label>

          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            autoComplete="name"
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium"
          >
            Email
          </label>

          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium"
          >
            Password
          </label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {success && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
            <p className="text-sm text-emerald-400">{success}</p>

            <Link
              href={loginHref}
              className="mt-2 inline-block text-sm font-semibold text-foreground underline underline-offset-4"
            >
              Go to Sign In
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
