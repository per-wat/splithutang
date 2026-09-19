"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { getParentRoute } from "@/lib/navigation";

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
  const pathname = usePathname();

  function goBack() {
    router.replace(getParentRoute(pathname) ?? fallbackHref);
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
