"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SettingsContext } from "@/lib/settings-context";
import type { SettingsContextValue } from "@/lib/settings-context";

const LS_AUTH = "auth_token";
const LS_WORKSPACE = "workspace_id";

type SettingsShellStatus = "checking" | "login" | "expired" | "ready";

type SettingsShellProps = {
  children: React.ReactNode;
};

function isWorkspacesApiResponse(
  v: unknown
): v is { data: { id: string }[] } {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const data = (v as Record<string, unknown>).data;
  return Array.isArray(data);
}

/**
 * Auth guard for all /settings/* pages.
 *
 * On mount:
 *   1. Reads auth_token from localStorage.
 *   2. If missing → shows login form.
 *   3. If present → GET /api/workspaces liveness check.
 *      - 401 → clears token, shows "session expired" amber banner + login form.
 *      - OK  → provides { accessToken, workspaceId } via SettingsContext to children.
 */
export function SettingsShell({
  children,
}: SettingsShellProps): React.ReactElement {
  const [status, setStatus] = useState<SettingsShellStatus>("checking");
  const [contextValue, setContextValue] =
    useState<SettingsContextValue | null>(null);

  /* login form state */
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [signingIn, setSigningIn] = useState<boolean>(false);

  /**
   * Calls GET /api/workspaces with the given token.
   * On success: stores token + workspaceId, transitions to "ready".
   * On 401: removes stale token, transitions to "expired".
   */
  const completeSetup = useCallback(async (token: string): Promise<void> => {
    try {
      const res = await fetch("/api/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(LS_AUTH);
        }
        setStatus("expired");
        return;
      }

      /* Resolve workspace_id — from localStorage or first workspace returned */
      let wsId =
        typeof window !== "undefined"
          ? (window.localStorage.getItem(LS_WORKSPACE) ?? "")
          : "";

      if (wsId === "") {
        const json: unknown = await res.json().catch(() => null);
        if (isWorkspacesApiResponse(json)) {
          const firstId = json.data[0]?.id;
          if (firstId !== undefined && firstId !== "") {
            wsId = firstId;
          }
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_AUTH, token);
        if (wsId !== "") {
          window.localStorage.setItem(LS_WORKSPACE, wsId);
        }
      }

      setContextValue({ accessToken: token, workspaceId: wsId });
      setStatus("ready");
    } catch {
      setStatus("expired");
    }
  }, []);

  /* On mount: check stored token */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = window.localStorage.getItem(LS_AUTH) ?? "";
    if (storedToken === "") {
      setStatus("login");
      return;
    }
    void completeSetup(storedToken);
  }, [completeSetup]);

  function handleSignIn(): void {
    if (email.trim() === "" || password.trim() === "") {
      setAuthError("Email and password are required.");
      return;
    }
    setAuthError("");
    setSigningIn(true);
    void supabase.auth
      .signInWithPassword({ email: email.trim(), password })
      .then(({ data, error: signInError }) => {
        setSigningIn(false);
        if (signInError !== null) {
          setAuthError(signInError.message);
          return;
        }
        const token = data.session?.access_token ?? "";
        if (token === "") {
          setAuthError("Login succeeded but no token was returned.");
          return;
        }
        void completeSetup(token);
      });
  }

  /* ── Checking ────────────────────────────────────────────────────────────── */
  if (status === "checking") {
    return (
      <div className="flex items-center justify-center min-h-96 text-sm text-slate-500 gap-2">
        <RefreshCw size={16} className="animate-spin" />
        Checking session…
      </div>
    );
  }

  /* ── Login / session expired ────────────────────────────────────────────── */
  if (status === "login" || status === "expired") {
    const missingSupabaseEnv =
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "") === "" ||
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "") === "";

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">NM Media</h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access settings
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            {status === "expired" && (
              <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-3 text-sm text-amber-800">
                Your session expired. Please sign in again.
              </div>
            )}

            {missingSupabaseEnv && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.
              </div>
            )}

            <label>
              <span className="text-sm font-medium text-slate-700 mb-1 block">
                Email
              </span>
              <input
                id="settings-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-slate-700 mb-1 block">
                Password
              </span>
              <input
                id="settings-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </label>

            {authError !== "" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                {authError}
              </div>
            )}

            <button
              id="settings-login-submit"
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Ready ───────────────────────────────────────────────────────────────── */
  if (contextValue === null) {
    /* Should not happen — status===ready implies contextValue set */
    return <div />;
  }

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}
