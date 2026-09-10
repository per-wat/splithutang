import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

function getSafeNext(value: string | string[] | undefined) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }

  return value;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const supabase = await createClient();
  const [{ data, error }, params] = await Promise.all([
    supabase.auth.getClaims(),
    searchParams,
  ]);

  if (error || !data?.claims.sub) {
    redirect("/forgot-password?error=invalid-link");
  }

  return <ResetPasswordForm nextPath={getSafeNext(params.next)} />;
}
