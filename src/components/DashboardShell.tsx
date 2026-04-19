"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DashboardContext } from "@/components/DashboardContext";
import { useSupabaseSession } from "@/features/traffic/hooks/useSupabaseSession";
import { useProjectContext } from "@/lib/project-context";

const LS_AUTH = "auth_token";

type DashboardShellProps = {
  children: (ctx: DashboardContext) => React.ReactNode;
};

/**
 * Shared auth guard and project-context bridge for all dashboard pages.
 * - Shows login form when the user is not authenticated.
 * - Reads workspace + project from ProjectContext (no filter bar).
 * - Renders children with a simplified DashboardContext once ready.
 */
export function DashboardShell(props: DashboardShellProps): React.ReactElement {
  const { children } = props;
  const { accessToken, loggedIn, loading: authLoading } = useSupabaseSession();
  const {
    workspaceId,
    workspaceName,
    projectId,
    selectedProject,
    projects,
    loading: projectsLoading,
    error: projectsError,
  } = useProjectContext();

  /* ── Login form state ────────────────────────────────────────────────────── */
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  const wasLoggedIn = useRef<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  useEffect(() => {
    if (loggedIn) {
      wasLoggedIn.current = true;
      setSessionExpired(false);
    } else if (!authLoading && wasLoggedIn.current) {
      setSessionExpired(true);
    }
  }, [loggedIn, authLoading]);

  useEffect(() => {
    if (!loggedIn) setAuthError("");
    if (email !== "" || password !== "") setSessionExpired(false);
  }, [loggedIn, email, password]);

  /* Persist JWT so settings pages can use getAuthHeaders(). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loggedIn && accessToken.trim() !== "") {
      window.localStorage.setItem(LS_AUTH, accessToken);
    }
  }, [accessToken, loggedIn]);

  /* ── Auth loading ────────────────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw size={16} className="animate-spin" />
          Checking session…
        </div>
      </div>
    );
  }

  /* ── Login form ──────────────────────────────────────────────────────────── */
  if (!loggedIn) {
    const missingSupabaseEnv =
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "") === "" ||
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "") === "";

    const handleSignIn = (): void => {
      setAuthError("");
      if (email.trim() === "" || password.trim() === "") {
        setAuthError("Email and password are required.");
        return;
      }
      void supabase.auth
        .signInWithPassword({ email: email.trim(), password })
        .then(({ error: signInError }) => {
          if (signInError !== null) {
            setAuthError(signInError.message);
            return;
          }
          if (!rememberMe && typeof window !== "undefined") {
            const keys = Object.keys(window.localStorage).filter(
              (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
            );
            for (const key of keys) {
              const value = window.localStorage.getItem(key);
              if (value !== null) {
                window.sessionStorage.setItem(key, value);
                window.localStorage.removeItem(key);
              }
            }
          }
        });
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">NM Media</h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to your dashboard
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            {missingSupabaseEnv && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.
              </div>
            )}

            {sessionExpired && authError === "" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Your session has expired. Please sign in again.
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSignIn();
              }}
              className="space-y-4"
            >
              <label>
                <span className="text-sm font-medium text-slate-700 mb-1 block">
                  Email
                </span>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
                />
              </label>

              <label>
                <span className="text-sm font-medium text-slate-700 mb-1 block">
                  Password
                </span>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
                />
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">Remember me</span>
              </label>

              {authError !== "" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  {authError}
                </div>
              )}

              <button
                id="login-submit"
                type="submit"
                className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Sign in
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Logged in — determine empty states ─────────────────────────────────── */

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-sm text-slate-500">
        <RefreshCw size={16} className="animate-spin mr-2" />
        Loading projects…
      </div>
    );
  }

  if (projectsError !== null) {
    return (
      <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        {projectsError}
      </div>
    );
  }

  /** Level 1: user is in no workspace. */
  if (workspaceId === "") {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center p-8">
        <Building2 size={48} className="text-slate-300 mb-4" />
        <p className="text-sm font-medium text-slate-700">
          You haven&rsquo;t been added to a workspace yet.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Contact your NM Media admin to get access.
        </p>
      </div>
    );
  }

  /** Level 2: workspace exists but no projects. */
  if (projects.length === 0) {
    return (
      <div className="mx-6 mt-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-amber-800">
            No projects configured for this workspace. Set up your first project
            to start tracking.
          </p>
          <Link
            href="/settings"
            className="inline-block mt-2 text-xs font-medium text-amber-700 underline"
          >
            Setup →
          </Link>
        </div>
      </div>
    );
  }

  const ctx: DashboardContext = {
    accessToken,
    workspaceId,
    workspaceName,
    projectId,
    projectName: selectedProject?.name ?? "",
    projectAgencyLineTags: selectedProject?.traffic_agency_line_tags ?? null,
    projectBreakdownFields: selectedProject?.traffic_breakdown_fields ?? null,
    ghlLocationId: selectedProject?.ghl_location_id ?? null,
  };

  return <>{children(ctx)}</>;
}
