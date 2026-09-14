import { notFound, redirect } from "next/navigation";

import { RecurringForm } from "@/components/recurring/recurring-form";
import { getRecurringGroupOptions } from "@/lib/recurring-group-options";
import { parseRecurringDetail } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/server";

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data, error }, groups] = await Promise.all([
    supabase.rpc("get_recurring_detail", { p_arrangement_id: id, p_year: new Date().getFullYear() }),
    getRecurringGroupOptions(supabase, user.id),
  ]);
  if (error) throw new Error("Unable to load recurring payment");
  const detail = parseRecurringDetail(data);
  if (!detail || !detail.canEdit) notFound();
  return <RecurringForm groups={groups} existing={detail} />;
}
