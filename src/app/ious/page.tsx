import { redirect } from "next/navigation";

import { IousHeader } from "@/components/ious/ious-header";

import { IousList, type IouOverview } from "@/components/ious/ious-list";

import type { IouStatus } from "@/components/ious/iou-card";

import { getVerifiedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/date-format";

function getIouStatus(status: string): IouStatus {
  switch (status) {
    case "owed-to-me":
    case "i-owe":
    case "settled":
    case "group":
      return status;

    default:
      return "group";
  }
}

export default async function IousPage() {
  const supabase = await createClient();

  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("get_ious_overview");

  if (error) {
    console.error("Failed to load IOUs:", error);

    return (
      <>
        <IousHeader />

        <div className="px-5 pt-8">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-medium text-red-400">Unable to load Hutang</p>

            <p className="mt-1 text-sm text-muted-foreground">
              Please try again later.
            </p>
          </div>
        </div>
      </>
    );
  }

  const ious: IouOverview[] = (data ?? []).map((iou) => ({
    id: iou.iou_id,
    title: iou.reason,
    date: formatDateOnly(iou.iou_date),
    from: iou.from_name,
    to: iou.to_name,

    // Show what is still owed.
    amount: Number(iou.outstanding_amount),

    originalAmount: Number(iou.original_amount),

    status: getIouStatus(iou.status),
  }));

  return (
    <>
      <IousHeader />

      <IousList ious={ious} />
    </>
  );
}
