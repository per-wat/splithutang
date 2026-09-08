import { notFound, redirect } from "next/navigation";

import { ReceiptTestClient } from "@/components/receipts/receipt-test-client";
import { createClient } from "@/lib/supabase/server";

export default async function ReceiptTestPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ReceiptTestClient />;
}
