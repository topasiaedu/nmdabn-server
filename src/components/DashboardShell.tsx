"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DashboardContext } from "@/components/DashboardContext";
import {
  fetchProjects,
  fetchWebinarRuns,
  fetchWorkspaces,
} from "@/features/traffic/services/api";
import { useSupabaseSession } from "@/features/traffic/hooks/useSupabaseSession";
import type { ProjectItem, WebinarRunListItem, WorkspaceItem } from "@/features/traffic/types";

const LS_AUTH = "auth_token";
const LS_WORKSPACE = "workspace_id";
const LS_PROJECT = "project_id";

type DashboardShellProps = {
  children: (ctx: DashboardContext) => React.ReactNode;
};

/**
 * Shared auth, workspace/project/webinar run selectors, optional date range, and localStorage sync for settings pages.
 */
export function DashboardShell(props: DashboardShellProps): React.ReactElement {
  const { children } = props;
  const { accessToken, loggedIn, loading: authLoading } = useSupabaseSession();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectId, setProjectId] = useState<string>("");

  const [allWebinarRuns, setAllWebinarRuns] = useState<WebinarRunListItem[]>(
    []
  );
  const [webinarRunId, setWebinarRunId] = useState<string>("");

  const [dateFromInput, setDateFromInput] = useState<string>("");
  const [dateToInput, setDateToInput] = useState<string>("");

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) {
      setAuthError("");
    }
  }, [loggedIn]);

  /** Persist Supabase JWT for `/settings` routes that use getAuthHeaders(). */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (loggedIn && accessToken.trim() !== "") {
      window.localStorage.setItem(LS_AUTH, accessToken);
    }
  }, [accessToken, loggedIn]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (workspaceId !== "") {
      window.localStorage.setItem(LS_WORKSPACE, workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (projectId !== "") {
      window.localStorage.setItem(LS_PROJECT, projectId);
    }
  }, [projectId]);

  useEffect(() => {
    if (!loggedIn) {
      return;
    }
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const result = await fetchWorkspaces(accessToken);
        if (cancelled) {
          return;
        }
        setWorkspaces(result);
        setLoadError(null);
        if (result.length === 0) {
          setWorkspaceId("");
          return;
        }
        let preferred = "";
        if (typeof window !== "undefined") {
          const stored = window.localStorage.getItem(LS_WORKSPACE);
          if (
            stored !== null &&
            stored !== "" &&
            result.some((w) => w.id === stored)
          ) {
            preferred = stored;
          }
        }
        setWorkspaceId((prev) => {
          if (preferred !== "") {
            return preferred;
          }
          if (prev !== "" && result.some((w) => w.id === prev)) {
            return prev;
          }
          return result[0]?.id ?? "";
        });
      } catch (requestError) {
        if (!cancelled) {
          setLoadError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load workspaces."
          );
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loggedIn]);

  useEffect(() => {
    if (!loggedIn || workspaceId === "") {
      return;
    }
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const result = await fetchProjects(accessToken, workspaceId);
        if (cancelled) {
          return;
        }
        setProjects(result);
        setLoadError(null);
        if (result.length === 0) {
          setProjectId("");
          return;
        }
        let preferred = "";
        if (typeof window !== "undefined") {
          const stored = window.localStorage.getItem(LS_PROJECT);
          if (
            stored !== null &&
            stored !== "" &&
            result.some((p) => p.id === stored)
          ) {
            preferred = stored;
          }
        }
        setProjectId((prev) => {
          if (preferred !== "") {
            return preferred;
          }
          if (prev !== "" && result.some((p) => p.id === prev)) {
            return prev;
          }
          return result[0]?.id ?? "";
        });
      } catch (requestError) {
        if (!cancelled) {
          setLoadError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load projects."
          );
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loggedIn, workspaceId]);

  useEffect(() => {
    if (!loggedIn || workspaceId === "") {
      return;
    }
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const result = await fetchWebinarRuns(accessToken, workspaceId);
        if (cancelled) {
          return;
        }
        setAllWebinarRuns(result);
        setLoadError(null);
      } catch (requestError) {
        if (!cancelled) {
          setLoadError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load webinar runs."
          );
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loggedIn, workspaceId]);

  const runsForProject = useMemo(
    () => allWebinarRuns.filter((run) => run.project_id === projectId),
    [allWebinarRuns, projectId]
  );

  useEffect(() => {
    if (projectId === "") {
      setWebinarRunId("");
      return;
    }
    if (runsForProject.length === 0) {
      setWebinarRunId("");
      return;
    }
    setWebinarRunId((prev) => {
      if (prev !== "" && runsForProject.some((r) => r.id === prev)) {
        return prev;
      }
      return runsForProject[0]?.id ?? "";
    });
  }, [projectId, runsForProject]);

  const onSignOut = useCallback((): void => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_AUTH);
      window.localStorage.removeItem(LS_WORKSPACE);
      window.localStorage.removeItem(LS_PROJECT);
    }
    void supabase.auth.signOut();
  }, []);

  const dateFrom: string | null =
    dateFromInput.trim() === "" ? null : dateFromInput.trim();
  const dateTo: string | null =
    dateToInput.trim() === "" ? null : dateToInput.trim();

  const ctx: DashboardContext = {
    accessToken,
    workspaceId,
    projectId,
    webinarRunId,
    dateFrom,
    dateTo,
  };

  if (!loggedIn) {
    const missingSupabaseEnv =
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "") === "" ||
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "") === "";

    if (authLoading) {
      return (
        <div>
          <p className="muted">Checking session...</p>
        </div>
      );
    }

    return (
      <div>
        <p className="muted">Sign in with your Supabase account.</p>
        <div className="card">
          {missingSupabaseEnv ? (
            <p className="error">
              Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.
            </p>
          ) : null}
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password"
            />
          </label>
          <button
            type="button"
            onClick={() => {
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
                  }
                });
            }}
          >
            Sign in
          </button>
          {authError !== "" ? <p className="error">{authError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {loadError !== null ? <p className="error">{loadError}</p> : null}

      <div className="card">
        <label>
          Workspace
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.length === 0 ? (
              <option value="">No workspaces</option>
            ) : null}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} ({workspace.role})
              </option>
            ))}
          </select>
        </label>
        <label>
          Project
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">No projects</option>
            ) : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Webinar run
          <select
            value={webinarRunId}
            onChange={(event) => setWebinarRunId(event.target.value)}
            disabled={runsForProject.length === 0}
          >
            {runsForProject.length === 0 ? (
              <option value="">No runs for this project</option>
            ) : null}
            {runsForProject.map((run) => (
              <option key={run.id} value={run.id}>
                {run.display_label}
              </option>
            ))}
          </select>
        </label>
        <div className="row mt-2 flex-wrap">
          <label className="mb-0 flex-1 min-w-[140px]">
            Date from
            <input
              type="date"
              value={dateFromInput}
              onChange={(event) => setDateFromInput(event.target.value)}
            />
          </label>
          <label className="mb-0 flex-1 min-w-[140px]">
            Date to
            <input
              type="date"
              value={dateToInput}
              onChange={(event) => setDateToInput(event.target.value)}
            />
          </label>
        </div>
      </div>

      {children(ctx)}
    </div>
  );
}
