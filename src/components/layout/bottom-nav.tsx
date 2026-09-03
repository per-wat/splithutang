"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Home, Plus, Receipt, Users, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Receipt,
  },
  {
    label: "IOUs",
    href: "/ious",
    icon: FileText,
  },
  {
    label: "People",
    href: "/people",
    icon: Users,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleAddIou = () => {
    closeMenu();
    router.push("/add-iou");
  };

  return (
    <>
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {isMenuOpen && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 space-y-3">
          <button
            type="button"
            onClick={() => {
              closeMenu();
              router.push("/add-expense");
            }}
            className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left text-zinc-900 shadow-xl transition-transform active:scale-[0.98]"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
              <Receipt className="size-6 text-blue-600" />
            </div>

            <div>
              <p className="font-semibold">Add Expense</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Split a bill among friends
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleAddIou}
            className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left text-zinc-900 shadow-xl transition-transform active:scale-[0.98]"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50">
              <FileText className="size-6 text-purple-500" />
            </div>

            <div>
              <p className="font-semibold">Add IOU</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Track a personal debt
              </p>
            </div>
          </button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-md items-center justify-around px-2">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/people" && pathname.startsWith("/groups"));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex w-16 flex-col items-center gap-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-blue-500"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon
                  className="size-5"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            aria-label={isMenuOpen ? "Close add menu" : "Add"}
            onClick={() => setIsMenuOpen((open) => !open)}
            className={`relative -mt-8 flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-all active:scale-95 ${
              isMenuOpen
                ? "bg-white text-zinc-700 shadow-black/20"
                : "bg-blue-600 shadow-blue-600/30"
            }`}
          >
            {isMenuOpen ? (
              <X
                className="size-6"
                strokeWidth={2}
              />
            ) : (
              <Plus
                className="size-7"
                strokeWidth={2}
              />
            )}
          </button>

          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/people" && pathname.startsWith("/groups"));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex w-16 flex-col items-center gap-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-blue-500"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon
                  className="size-5"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
