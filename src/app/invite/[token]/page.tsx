import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";

import { AcceptInviteAction } from "@/components/invites/accept-invite-action";
import { formatTimestampDateMY } from "@/lib/date-format";
import { createClient } from "@/lib/supabase/server";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  if (!uuidPattern.test(token)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: previewRows, error: previewError } = await supabase.rpc(
    "get_group_invite_preview",
    {
      p_token: token,
    },
  );

  if (previewError) {
    console.error("Unable to load invitation:", previewError);

    throw new Error("Unable to load invitation");
  }

  const invite = previewRows?.[0];

  if (!invite) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextPath = `/invite/${token}`;

  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;

  const isPending = invite.status === "pending";

  const isAccepted = invite.status === "accepted";

  const isExpired = invite.status === "expired";

  const isRevoked = invite.status === "revoked";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-5 text-foreground">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/[0.08] bg-card p-6">
          {/* Icon */}
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-600/10">
            <UsersRound className="size-6 text-blue-400" />
          </div>

          {/* Heading */}
          <div className="mt-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-400">
              Group Invitation
            </p>

            <h1 className="mt-2 text-2xl font-bold">{invite.group_name}</h1>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You&apos;ve been invited to claim the SplitHutang contact{" "}
              <span className="font-semibold text-foreground">
                {invite.contact_name}
              </span>
              .
            </p>
          </div>

          {/* Details */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-background">
            <div className="flex items-center gap-3 px-4 py-4">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Invited as</p>

                <p className="mt-0.5 truncate text-sm font-semibold">
                  {invite.contact_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-4">
              <div className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                @
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  Invitation email
                </p>

                <p className="mt-0.5 truncate text-sm font-semibold">
                  {invite.email_hint}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-4">
              <Clock3 className="size-4 shrink-0 text-muted-foreground" />

              <div>
                <p className="text-xs text-muted-foreground">Expires</p>

                <p className="mt-0.5 text-sm font-semibold">
                  {formatTimestampDateMY(invite.expires_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Pending */}
          {isPending && !user && (
            <div className="mt-6">
              <p className="text-center text-sm text-muted-foreground">
                Sign in with the email address this invitation was sent to.
              </p>

              <Link
                href={loginHref}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Sign In
              </Link>

              <Link
                href={signupHref}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl border border-white/[0.08] bg-background font-semibold text-foreground transition-colors hover:bg-white/[0.04]"
              >
                Create Account
              </Link>
            </div>
          )}

          {/* Logged in */}
          {isPending && user && (
            <div className="mt-6">
              <div className="mb-4 rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-muted-foreground">Signed in as</p>

                <p className="mt-1 break-all text-sm font-semibold">
                  {user.email ?? "Authenticated user"}
                </p>
              </div>

              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Accepting this invitation will merge the existing local contact
                and its transaction history into your account.
              </p>

              <AcceptInviteAction token={token} />

              <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                The account email must match the invitation email.
              </p>
            </div>
          )}

          {/* Accepted */}
          {isAccepted && (
            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
              <CheckCircle2 className="mx-auto size-6 text-emerald-400" />

              <p className="mt-2 font-semibold text-emerald-400">
                Invitation accepted
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                This invitation has already been used.
              </p>

              {user && (
                <Link
                  href={`/groups/${invite.group_id}`}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-400"
                >
                  Open Group
                </Link>
              )}
            </div>
          )}

          {/* Expired */}
          {isExpired && (
            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
              <Clock3 className="mx-auto size-6 text-amber-400" />

              <p className="mt-2 font-semibold text-amber-400">
                Invitation expired
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Ask the group owner to create a new invitation.
              </p>
            </div>
          )}

          {/* Revoked */}
          {isRevoked && (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center">
              <XCircle className="mx-auto size-6 text-red-400" />

              <p className="mt-2 font-semibold text-red-400">
                Invitation revoked
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                This invitation is no longer valid.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
