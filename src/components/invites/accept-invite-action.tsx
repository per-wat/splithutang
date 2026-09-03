"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type AcceptInviteActionProps = {
  token: string;
};

export function AcceptInviteAction({ token }: AcceptInviteActionProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [accepting, setAccepting] = useState(false);

  const [error, setError] = useState("");

  async function acceptInvite() {
    if (accepting) {
      return;
    }

    setAccepting(true);
    setError("");

    const { data: groupId, error } = await supabase.rpc("claim_group_invite", {
      p_token: token,
    });

    if (error) {
      setError(error.message);

      setAccepting(false);
      return;
    }

    if (!groupId) {
      setError("Invitation was accepted but no group was returned.");

      setAccepting(false);
      return;
    }

    router.push(`/groups/${groupId}`);

    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={acceptInvite}
        disabled={accepting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        <CheckCircle2 className="size-5" />

        {accepting ? "Accepting..." : "Accept Invitation"}
      </button>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
