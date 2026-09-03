"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ChangePasswordFormProps = {
  email: string;
};

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const supabase = useMemo(() => createClient(), []);

  const [currentPassword, setCurrentPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("Enter your current password.");

      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");

      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");

      return;
    }

    if (currentPassword === newPassword) {
      setError(
        "Your new password must be different from your current password.",
      );

      return;
    }

    if (!email) {
      setError("Unable to verify your account email.");

      return;
    }

    setLoading(true);

    /*
     * ------------------------------------------
     * Verify current password
     * ------------------------------------------
     *
     * Signing in again with the current
     * credentials proves that the user knows
     * their existing password.
     */
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (verifyError) {
      setError("Your current password is incorrect.");

      setLoading(false);
      return;
    }

    /*
     * ------------------------------------------
     * Update password
     * ------------------------------------------
     */
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);

      setLoading(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    setSuccess("Password changed successfully.");

    setLoading(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/[0.08] bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10">
          <KeyRound className="size-4 text-blue-400" />
        </div>

        <div>
          <p className="text-sm font-semibold">Change Password</p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Confirm your current password before choosing a new one.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="current-password"
            className="text-xs font-semibold text-muted-foreground"
          >
            Current Password
          </label>

          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="text-xs font-semibold text-muted-foreground"
          >
            New Password
          </label>

          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-blue-500"
          />

          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Minimum 8 characters.
          </p>
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="text-xs font-semibold text-muted-foreground"
          >
            Confirm New Password
          </label>

          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs leading-relaxed text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400" />

            <p className="text-xs font-medium text-emerald-400">{success}</p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={
          loading || !currentPassword || !newPassword || !confirmPassword
        }
        className="mt-5 h-11 w-full rounded-xl bg-blue-600/10 text-sm font-semibold text-blue-400 transition-colors hover:bg-blue-600/20 disabled:opacity-50"
      >
        {loading ? "Changing Password..." : "Change Password"}
      </button>
    </form>
  );
}
