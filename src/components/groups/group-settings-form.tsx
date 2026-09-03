"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type GroupSettingsFormProps = {
  groupId: string;
  initialName: string;
  initialAllowDebtorSelfConfirm: boolean;
};

export function GroupSettingsForm({
  groupId,
  initialName,
  initialAllowDebtorSelfConfirm,
}: GroupSettingsFormProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState(initialName);

  const [allowDebtorSelfConfirm, setAllowDebtorSelfConfirm] = useState(
    initialAllowDebtorSelfConfirm,
  );

  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");

  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim() || saving) {
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    const { error } = await supabase.rpc("update_group_settings", {
      p_group_id: groupId,

      p_name: name.trim(),

      p_allow_debtor_self_confirm: allowDebtorSelfConfirm,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setMessage("Settings saved.");

    setSaving(false);

    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="group-settings-name"
          className="text-sm font-semibold"
        >
          Group Name
        </label>

        <input
          id="group-settings-name"
          type="text"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 outline-none transition-colors focus:border-blue-500"
        />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/[0.03] p-4">
        <div>
          <p className="text-sm font-semibold">Debtor self-confirm</p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Allow debtors to confirm their own payments immediately.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={allowDebtorSelfConfirm}
          onClick={() => setAllowDebtorSelfConfirm((value) => !value)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            allowDebtorSelfConfirm ? "bg-blue-600" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute left-1 top-1 size-5 rounded-full bg-white transition-transform ${
              allowDebtorSelfConfirm ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
