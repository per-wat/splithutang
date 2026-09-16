"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type AppBackButtonProps = {
  fallbackHref: string;
  label: string;
  className?: string;
};

export function AppBackButton({
  fallbackHref,
  label,
  className = "",
}: AppBackButtonProps) {
  const router = useRouter();
  const fallbackTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackTimer.current !== null) {
        window.clearTimeout(fallbackTimer.current);
      }
    };
  }, []);

  function goBack() {
    const currentUrl = window.location.href;

    router.back();

    fallbackTimer.current = window.setTimeout(() => {
      if (window.location.href === currentUrl) {
        router.replace(fallbackHref);
      }
    }, 400);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
