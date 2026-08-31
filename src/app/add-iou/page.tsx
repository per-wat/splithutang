import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { IouForm } from "@/components/ious/iou-form";

export default function AddIouPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        <header className="flex items-center gap-3 px-4 pt-6">
          <Link
            href="/"
            aria-label="Go back"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <h1 className="text-xl font-bold">Add IOU</h1>
        </header>

        <div className="pt-3">
          <IouForm />
        </div>
      </div>
    </main>
  );
}
