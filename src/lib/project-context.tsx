"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSupabaseSession } from "@/features/traffic/hooks/useSupabaseSession";

/** Minimal project shape used throughout the app. */
export interface ProjectItem {
  id: string;
  name: string;
  ghl_location_id: string | null;
  traffic_agency_line_tags: Record<string, string[]> | null;
  traffic_breakdown_fields: Array<{ field_key: string; label: string }> | null;
}

interface ProjectContextValue {
  /** The user's workspace id (auto-selected). */
  workspaceId: string;
  workspaceName: string;
  /** All projects visible in the workspace. */
  projects: ProjectItem[];
  /** Currently selected project id (persisted in localStorage). */
  projectId: string;
  /** Switch the selected project. */
  setProjectId: (id: string) => void;
  /** The full selected project row, or null when nothing is selected / still loading. */
  selectedProject: ProjectItem | null;
  loading: boolean;
  error: string | null;
}

const ProjectContext = createContext<ProjectContextValue>({
  workspaceId: "",
  workspaceName: "",
  projects: [],
  projectId: "",
  setProjectId: () => undefined,
  selectedProject: null,
  loading: false,
  error: null,
});

const LS_WORKSPACE = "workspace_id";
const LS_PROJECT = "project_id";

function authHeader(token: string): Record<string, string> {
  if (token.trim() === "") return {};
  return { Authorization: `Bearer ${token}` };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceAgencyLineTags(
  raw: unknown
): Record<string, string[]> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v as string[];
    }
  }
  return out;
}

function coerceBreakdownFields(
  raw: unknown
): Array<{ field_key: string; label: string }> | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<{ field_key: string; label: string }> = [];
  for (const item of raw) {
    if (
      isRecord(item) &&
      typeof item.field_key === "string" &&
      typeof item.label === "string"
    ) {
      out.push({ field_key: item.field_key, label: item.label });
    }
  }
  return out.length > 0 ? out : null;
}

function parseProject(v: unknown): ProjectItem | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.name !== "string") return null;
  const ghl = v.ghl_location_id;
  if (ghl !== null && typeof ghl !== "string") return null;
  return {
    id: v.id,
    name: v.name,
    ghl_location_id: typeof ghl === "string" ? ghl : null,
    traffic_agency_line_tags: coerceAgencyLineTags(v.traffic_agency_line_tags),
    traffic_breakdown_fields: coerceBreakdownFields(
      v.traffic_breakdown_fields
    ),
  };
}

/**
 * Wraps the app and provides workspace + project selection.
 * - Auto-selects the first workspace (1 account = 1 workspace assumption).
 * - Persists selected project id in localStorage.
 */
export function ProjectProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { accessToken, loggedIn } = useSupabaseSession();

  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectId, setProjectIdState] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /** Persist + update projectId. */
  const setProjectId = useCallback((id: string): void => {
    setProjectIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_PROJECT, id);
    }
  }, []);

  /** Load workspaces then projects on login. */
  useEffect(() => {
    if (!loggedIn || accessToken.trim() === "") {
      return;
    }
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch workspaces
        const wsRes = await fetch("/api/workspaces", {
          headers: authHeader(accessToken),
        });
        if (!wsRes.ok) throw new Error("Failed to load workspaces");
        const wsBody: unknown = await wsRes.json();
        if (!isRecord(wsBody) || !Array.isArray(wsBody.data)) {
          throw new Error("Unexpected workspace response");
        }

        let selectedWsId = "";
        let selectedWsName = "";

        /** Prefer stored workspace, fall back to first. */
        const storedWs =
          typeof window !== "undefined"
            ? (window.localStorage.getItem(LS_WORKSPACE) ?? "")
            : "";

        const workspaceList = wsBody.data as Array<unknown>;
        for (const ws of workspaceList) {
          if (!isRecord(ws)) continue;
          const id = typeof ws.id === "string" ? ws.id : "";
          if (id === "") continue;
          if (selectedWsId === "") {
            selectedWsId = id;
            selectedWsName =
              typeof ws.name === "string" ? ws.name : "";
          }
          if (id === storedWs) {
            selectedWsId = id;
            selectedWsName =
              typeof ws.name === "string" ? ws.name : "";
            break;
          }
        }

        if (cancelled) return;
        setWorkspaceId(selectedWsId);
        setWorkspaceName(selectedWsName);
        if (typeof window !== "undefined" && selectedWsId !== "") {
          window.localStorage.setItem(LS_WORKSPACE, selectedWsId);
        }

        if (selectedWsId === "") {
          setProjects([]);
          setLoading(false);
          return;
        }

        // 2. Fetch projects
        const pqs = new URLSearchParams({ workspace_id: selectedWsId });
        const pRes = await fetch(`/api/projects?${pqs.toString()}`, {
          headers: authHeader(accessToken),
        });
        if (!pRes.ok) throw new Error("Failed to load projects");
        const pBody: unknown = await pRes.json();
        if (!isRecord(pBody) || !Array.isArray(pBody.data)) {
          throw new Error("Unexpected projects response");
        }

        if (cancelled) return;

        const parsed = pBody.data
          .map(parseProject)
          .filter((p): p is ProjectItem => p !== null);
        setProjects(parsed);

        // 3. Restore or auto-select project
        const storedPid =
          typeof window !== "undefined"
            ? (window.localStorage.getItem(LS_PROJECT) ?? "")
            : "";

        setProjectIdState((prev) => {
          if (storedPid !== "" && parsed.some((p) => p.id === storedPid)) {
            return storedPid;
          }
          if (prev !== "" && parsed.some((p) => p.id === prev)) {
            return prev;
          }
          return parsed[0]?.id ?? "";
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load data"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loggedIn]);

  const selectedProject =
    projects.find((p) => p.id === projectId) ?? null;

  return (
    <ProjectContext.Provider
      value={{
        workspaceId,
        workspaceName,
        projects,
        projectId,
        setProjectId,
        selectedProject,
        loading,
        error,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

/** Consume the project context. Must be used inside ProjectProvider. */
export function useProjectContext(): ProjectContextValue {
  return useContext(ProjectContext);
}
