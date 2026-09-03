"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-card p-5 text-center">
        <h1 className="text-lg font-bold">Something went wrong</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t load this information safely. Please try again.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-5 h-11 w-full rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-500"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
