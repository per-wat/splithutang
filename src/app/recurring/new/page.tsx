import { redirect } from "next/navigation";

import { RecurringForm } from "@/components/recurring/recurring-form";
import { getRecurringGroupOptions } from "@/lib/recurring-group-options";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewRecurringPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");
  const groups = await getRecurringGroupOptions(supabase, user.id);
  return <RecurringForm groups={groups} />;
}
