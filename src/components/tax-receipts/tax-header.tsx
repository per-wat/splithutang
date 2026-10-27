import { AppBackButton } from "@/components/layout/app-back-button";
import { AppMenu } from "@/components/layout/app-menu";
export function TaxHeader({ title = "Tax receipts", subtitle = "Save evidence. Understand your relief." }: { title?: string; subtitle?: string }) {
  return <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/[0.05] bg-background/95 px-5 pb-3 pt-6 backdrop-blur-md">
    <div className="flex min-w-0 items-center gap-3"><AppBackButton fallbackHref="/tax-receipts" label="Go back" /><div className="min-w-0"><h1 className="text-xl font-bold">{title}</h1><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div></div><AppMenu />
  </header>;
}
