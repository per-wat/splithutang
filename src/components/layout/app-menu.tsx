"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  ChevronRight,
  FileText,
  Gauge,
  Home,
  ListChecks,
  Menu,
  QrCode,
  Receipt,
  Settings,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { createClient } from "@/lib/supabase/client";
import { useHistoryOverlay } from "@/hooks/use-history-overlay";

type MenuProfile = {
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
};

type AppMenuProps = {
  initialProfile?: MenuProfile;
  initialCanViewUsage?: boolean;
};

type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
};

const mainItems: MenuItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Expenses", href: "/expenses", icon: Receipt },
  { label: "Hutang", href: "/ious", icon: FileText },
  { label: "Recurring", href: "/recurring", icon: CalendarClock },
  { label: "People", href: "/people", icon: Users },
  { label: "Groups", href: "/groups", icon: UsersRound },
];

const supportItems: MenuItem[] = [
  { label: "Getting Started", href: "/getting-started", icon: ListChecks },
  { label: "Payment QR", href: "/payment-qr", icon: QrCode },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Usage", href: "/usage", icon: Gauge, ownerOnly: true },
];

function isCurrentRoute(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function AppMenu({ initialProfile, initialCanViewUsage }: AppMenuProps) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const { open, openOverlay, dismiss, closeForNavigation } =
    useHistoryOverlay("app-menu");
  const [profile, setProfile] = useState<MenuProfile | null>(
    initialProfile ?? null,
  );
  const [profileLoaded, setProfileLoaded] = useState(Boolean(initialProfile));
  const [canViewUsage, setCanViewUsage] = useState(
    initialCanViewUsage ?? false,
  );
  const [accessLoaded, setAccessLoaded] = useState(
    initialCanViewUsage !== undefined,
  );

  async function loadProfile() {
    if (profileLoaded && accessLoaded) return;

    const shouldLoadProfile = !profileLoaded;
    const shouldLoadAccess = !accessLoaded;

    if (shouldLoadProfile) {
      setProfileLoaded(true);
    }

    if (shouldLoadAccess) {
      setAccessLoaded(true);
    }

    const [userResult, accessResponse] = await Promise.all([
      shouldLoadProfile ? supabase.auth.getUser() : Promise.resolve(null),
      shouldLoadAccess
        ? fetch("/api/usage/access", { cache: "no-store" }).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (accessResponse?.ok) {
      const access = (await accessResponse.json()) as {
        canViewUsage?: boolean;
      };

      setCanViewUsage(access.canViewUsage === true);
    }

    if (!userResult || userResult.error || !userResult.data.user) {
      return;
    }

    const user = userResult.data.user;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("display_name, avatar_color, avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    let avatarUrl: string | null = null;

    if (profileRow?.avatar_path) {
      const { data } = supabase.storage
        .from("avatars")
        .getPublicUrl(profileRow.avatar_path);

      avatarUrl = data.publicUrl;
    }

    setProfile({
      displayName:
        profileRow?.display_name ?? user.email?.split("@")[0] ?? "You",
      avatarColor: profileRow?.avatar_color ?? "bg-blue-600",
      avatarUrl,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      openOverlay();
      void loadProfile();
    } else {
      dismiss();
    }
  }

  function renderMenuItem(item: MenuItem) {
    const Icon = item.icon;
    const active = isCurrentRoute(pathname, item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        replace
        onClick={closeForNavigation}
        aria-current={active ? "page" : undefined}
        className={`flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
          active
            ? "bg-blue-600/15 text-blue-300"
            : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
        }`}
      >
        <Icon className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        aria-label="Open navigation menu"
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-card text-muted-foreground transition-colors hover:text-foreground active:scale-95"
      >
        <Menu className="size-5" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] min-h-dvh bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />

        <Dialog.Popup className="fixed inset-y-0 right-0 z-[90] flex h-dvh w-[85vw] max-w-sm flex-col border-l border-white/[0.08] bg-zinc-950 text-foreground shadow-2xl shadow-black/50 transition-transform duration-200 ease-out data-ending-style:translate-x-full data-starting-style:translate-x-full">
          <div
            className="flex items-center justify-between border-b border-white/[0.07] px-5 pb-4"
            style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
          >
            <div>
              <Dialog.Title className="text-lg font-bold">
                SplitHutang
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                Navigate around the app
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="Close navigation menu"
              className="flex size-10 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
            <nav aria-label="Main navigation">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Main
              </p>
              <div className="space-y-1">{mainItems.map(renderMenuItem)}</div>
            </nav>

            <nav aria-label="Support and setup" className="mt-6">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Support &amp; setup
              </p>
              <div className="space-y-1">
                {supportItems
                  .filter((item) => !item.ownerOnly || canViewUsage)
                  .map(renderMenuItem)}
              </div>
            </nav>

            <div className="mt-auto pt-8">
              <Link
                href="/profile"
                replace
                onClick={closeForNavigation}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                  pathname === "/profile"
                    ? "border-blue-500/30 bg-blue-600/[0.08]"
                    : "border-white/[0.08] bg-card hover:bg-white/[0.05]"
                }`}
              >
                <ProfileAvatar
                  name={profile?.displayName ?? "You"}
                  avatarColor={profile?.avatarColor ?? "bg-blue-600"}
                  avatarUrl={profile?.avatarUrl ?? null}
                  className="size-11 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {profile?.displayName ?? "Your profile"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    View profile
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
