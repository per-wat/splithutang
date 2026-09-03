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

function LoginForm() {
  const router = useRouter();

  const searchParams = useSearchParams();

  const supabase = useMemo(() => createClient(), []);

  const nextPath = getSafeNext(searchParams.get("next"));

  const signupHref =
    nextPath === "/"
      ? "/signup"
      : `/signup?next=${encodeURIComponent(nextPath)}`;

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),

      password,
    });

    if (error) {
      setError(error.message);

      setLoading(false);
      return;
    }

    router.push(nextPath);

    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">SplitHutang</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to continue
          </p>

          {nextPath.startsWith("/invite/") && (
            <p className="mt-2 text-xs text-blue-400">
              Sign in to continue with your group invitation.
            </p>
          )}
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
            autoComplete="current-password"
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={signupHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create account
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
