"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type DeleteLocalContactActionProps = {
  personId: string;
  personName: string;
};

export function DeleteLocalContactAction({
  personId,
  personName,
}: DeleteLocalContactActionProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteContact() {
    if (deleting) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${personName}? This permanently removes this unused local contact.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    const { error } = await supabase.rpc("delete_local_contact", {
      p_person_id: personId,
    });

    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }

    router.replace("/people");
    router.refresh();
  }

  return (
    <section className="mt-7 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
          <Trash2 className="size-4 text-red-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Delete Local Contact</p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Only unused contacts can be deleted. Remove the contact from every
            group first. Contacts with financial history are kept for your
            records.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={deleteContact}
        disabled={deleting}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        {deleting ? "Deleting..." : "Delete Contact"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
