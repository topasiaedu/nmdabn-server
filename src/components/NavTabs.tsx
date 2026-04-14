"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: readonly { href: string; label: string }[] = [
  { href: "/", label: "Traffic" },
  { href: "/showup", label: "Show Up" },
  { href: "/agency", label: "Agency" },
  { href: "/buyer-behavior", label: "Buyer Behavior" },
];

/**
 * Top navigation links with active state derived from the current pathname.
 */
export function NavTabs(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/"
            ? pathname === "/" || pathname === ""
            : pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              isActive
                ? "rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
