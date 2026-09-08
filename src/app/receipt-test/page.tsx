import { redirect } from "next/navigation";

import { ReceiptTestClient } from "@/components/receipts/receipt-test-client";
import { createClient } from "@/lib/supabase/server";

export default async function ReceiptTestPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ReceiptTestClient />;
}
