"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart2,
  ChevronDown,
  Settings,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSupabaseSession } from "@/features/traffic/hooks/useSupabaseSession";
import { useProjectContext } from "@/lib/project-context";

const LS_AUTH = "auth_token";
const LS_WORKSPACE = "workspace_id";
const LS_PROJECT = "project_id";

type TabDef = {
  href: string;
  label: string;
  icon: React.ElementType;
};

const TABS: readonly TabDef[] = [
  { href: "/", label: "Traffic", icon: Users },
  { href: "/showup", label: "Show Up", icon: BarChart2 },
  { href: "/agency", label: "Agency", icon: TrendingUp },
  { href: "/buyer-behavior", label: "Buyer Behavior", icon: ShoppingCart },
];

function tabIsActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname === "";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Global sticky nav bar — left zone: wordmark + dashboard tabs;
 * centre: project selector (hidden on settings routes);
 * right zone: Setup gear link (or ← Dashboards on settings pages) + user avatar dropdown.
 */
export function NavTabs(): React.ReactElement {
  const pathname = usePathname();
  const { loggedIn } = useSupabaseSession();
  const { projects, projectId, setProjectId } = useProjectContext();

  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSettingsRoute = pathname.startsWith("/settings");

  const [userEmail, setUserEmail] = useState<string>("");
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? "");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? "");
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      if (
        dropdownRef.current !== null &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [dropdownOpen]);

  function handleSignOut(): void {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_AUTH);
      window.localStorage.removeItem(LS_WORKSPACE);
      window.localStorage.removeItem(LS_PROJECT);
    }
    void supabase.auth.signOut();
    setDropdownOpen(false);
  }

  const avatarInitial =
    userEmail.length > 0 ? userEmail[0].toUpperCase() : "?";

  const selectedProjectName =
    projects.find((p) => p.id === projectId)?.name ?? "";

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center bg-white border-b border-slate-200 px-6 gap-4">
      {/* Left zone: wordmark + tabs */}
      <div className="flex items-center gap-0 shrink-0">
        <Link
          href="/"
          className="text-base font-bold text-slate-900 whitespace-nowrap"
        >
          NM Media
        </Link>

        <span className="mx-4 block w-px h-5 bg-slate-200" aria-hidden="true" />

        <nav className="flex items-center gap-5">
          {TABS.map((tab) => {
            const active = tabIsActive(tab.href, pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  active
                    ? "flex items-center gap-1.5 text-sm px-1 py-4 border-b-2 border-indigo-600 text-indigo-600 font-medium"
                    : "flex items-center gap-1.5 text-sm px-1 py-4 text-slate-500 hover:text-slate-800 font-normal border-b-2 border-transparent"
                }
              >
                <Icon size={16} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Centre: project selector — hidden on settings routes and when not logged in */}
      {!isSettingsRoute && loggedIn && projects.length > 0 ? (
        <div className="flex-1 flex justify-center">
          <div className="relative max-w-xs w-full">
            <select
              id="nav-project-selector"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Select project"
              className="appearance-none w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>
      ) : (
        /* Spacer so right zone stays pushed right */
        <div className="flex-1" />
      )}

      {/* Right zone */}
      <div className="flex items-center gap-3 shrink-0">
        {isSettingsRoute ? (
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Dashboards
          </Link>
        ) : (
          <Link
            href="/settings"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100"
          >
            <Settings size={16} />
            Setup
          </Link>
        )}

        {loggedIn ? (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              id="nav-user-avatar"
              aria-label="User menu"
              aria-expanded={dropdownOpen}
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {avatarInitial}
            </button>

            {dropdownOpen ? (
              <div className="absolute top-12 right-0 w-64 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-2">
                <p className="text-xs text-slate-500 px-3 py-2 truncate select-none">
                  {userEmail !== "" ? userEmail : "Signed in"}
                </p>
                {selectedProjectName !== "" && (
                  <p className="text-xs text-indigo-600 px-3 pb-1 truncate select-none font-medium">
                    Project: {selectedProjectName}
                  </p>
                )}
                <div className="border-t border-slate-100 my-1" />
                <button
                  type="button"
                  id="nav-sign-out"
                  onClick={handleSignOut}
                  className="w-full text-left text-sm text-red-600 hover:bg-red-50 rounded-lg px-3 py-2 font-medium"
                >
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
