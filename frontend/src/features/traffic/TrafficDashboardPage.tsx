"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { BreakdownTable } from "./components/BreakdownTable";
import { useSupabaseSession } from "./hooks/useSupabaseSession";
import {
  fetchProjects,
  fetchTrafficDashboard,
  fetchTrafficLines,
  fetchWorkspaces,
  saveProjectSettings,
} from "./services/api";
import type { ProjectItem, TrafficDashboardPayload, WorkspaceItem } from "./types";

export function TrafficDashboardPage(): React.ReactElement {
  const { accessToken, loggedIn, loading: authLoading } = useSupabaseSession();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectId, setProjectId] = useState<string>("");

  const [projectNameDraft, setProjectNameDraft] = useState<string>("");
  const [ghlLocationDraft, setGhlLocationDraft] = useState<string>("");
  const [occupationKeyDraft, setOccupationKeyDraft] = useState<string>("");
  const [lineTagsDraft, setLineTagsDraft] = useState<string>(
    "{\"OM\":[\"lead_om\"],\"NM\":[\"lead_nm\"]}"
  );
  const [settingsMsg, setSettingsMsg] = useState<string>("");
  const [settingsErr, setSettingsErr] = useState<string>("");
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);

  const [lines, setLines] = useState<string[]>([]);
  const [activeLine, setActiveLine] = useState<string>("");
  const [payload, setPayload] = useState<TrafficDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!loggedIn) {
      setAuthError("");
    }
  }, [loggedIn]);

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
        if (result.length > 0) {
          setWorkspaceId((prev) => (prev === "" ? (result[0]?.id ?? "") : prev));
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
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
        if (result.length > 0) {
          setProjectId((prev) => {
            if (prev === "") {
              return result[0]?.id ?? "";
            }
            return result.some((project) => project.id === prev)
              ? prev
              : result[0]?.id ?? "";
          });
        } else {
          setProjectId("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId]
  );

  useEffect(() => {
    if (selectedProject === null) {
      return;
    }
    setProjectNameDraft(selectedProject.name);
    setGhlLocationDraft(selectedProject.ghl_location_id ?? "");
    setOccupationKeyDraft(selectedProject.traffic_occupation_field_key ?? "");
    setLineTagsDraft(
      JSON.stringify(
        selectedProject.traffic_agency_line_tags ?? {
          OM: ["lead_om"],
          NM: ["lead_nm"],
        },
        null,
        2
      )
    );
  }, [selectedProject]);

  useEffect(() => {
    if (!loggedIn || workspaceId === "" || projectId === "") {
      return;
    }
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const result = await fetchTrafficLines(accessToken, workspaceId, projectId);
        if (cancelled) {
          return;
        }
        setLines(result);
        if (result.length > 0) {
          setActiveLine((prev) => {
            if (prev === "" || !result.includes(prev)) {
              return result[0] ?? "";
            }
            return prev;
          });
        } else {
          setActiveLine("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load lines."
          );
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loggedIn, projectId, workspaceId]);

  const canLoad = loggedIn && workspaceId !== "" && projectId !== "" && activeLine !== "";

  const refreshTraffic = useCallback(async (): Promise<void> => {
    if (!canLoad) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTrafficDashboard(
        accessToken,
        workspaceId,
        projectId,
        activeLine
      );
      setPayload(result);
    } catch (requestError) {
      setPayload(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeLine, canLoad, projectId, workspaceId]);

  useEffect(() => {
    if (canLoad) {
      void refreshTraffic();
    }
  }, [canLoad, refreshTraffic]);

  const onSaveSettings = useCallback(async (): Promise<void> => {
    if (!loggedIn || workspaceId === "" || projectId === "") {
      return;
    }
    setSettingsErr("");
    setSettingsMsg("");
    setSettingsSaving(true);
    try {
      await saveProjectSettings({
        accessToken,
        workspaceId,
        projectId,
        projectName: projectNameDraft,
        ghlLocationId: ghlLocationDraft,
        occupationFieldKey: occupationKeyDraft,
        lineTagsDraft,
      });
      setSettingsMsg("Project settings saved.");
      const refreshedProjects = await fetchProjects(accessToken, workspaceId);
      setProjects(refreshedProjects);
    } catch (requestError) {
      setSettingsErr(
        requestError instanceof Error ? requestError.message : "Failed to save."
      );
    } finally {
      setSettingsSaving(false);
    }
  }, [
    accessToken,
    ghlLocationDraft,
    lineTagsDraft,
    loggedIn,
    occupationKeyDraft,
    projectId,
    projectNameDraft,
    workspaceId,
  ]);

  if (!loggedIn) {
    const missingSupabaseEnv =
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "") === "" ||
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "") === "";

    if (authLoading) {
      return (
        <div>
          <h1>Traffic dashboard</h1>
          <p className="muted">Checking session...</p>
        </div>
      );
    }

    return (
      <div>
        <h1>Traffic dashboard</h1>
        <p className="muted">Sign in with your Supabase account.</p>
        <div className="card">
          {missingSupabaseEnv ? (
            <p className="error">
              Missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
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
      <h1>Traffic dashboard</h1>
      <div className="toolbar">
        <button
          type="button"
          onClick={() => {
            void supabase.auth.signOut();
          }}
        >
          Sign out
        </button>
      </div>

      <div className="card">
        <label>
          Workspace
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
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
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedProject !== null ? (
        <div className="card">
          <h2>Project settings</h2>
          <label>
            Project name
            <input
              value={projectNameDraft}
              onChange={(event) => setProjectNameDraft(event.target.value)}
            />
          </label>
          <label>
            GHL location id
            <input
              value={ghlLocationDraft}
              onChange={(event) => setGhlLocationDraft(event.target.value)}
            />
          </label>
          <label>
            Occupation field key/name
            <input
              value={occupationKeyDraft}
              onChange={(event) => setOccupationKeyDraft(event.target.value)}
            />
          </label>
          <label>
            Line tags JSON
            <textarea
              rows={5}
              value={lineTagsDraft}
              onChange={(event) => setLineTagsDraft(event.target.value)}
            />
          </label>
          <div className="row">
            <button
              type="button"
              disabled={settingsSaving}
              onClick={() => void onSaveSettings()}
            >
              {settingsSaving ? "Saving..." : "Save settings"}
            </button>
            {settingsMsg !== "" ? <span className="ok">{settingsMsg}</span> : null}
            {settingsErr !== "" ? <span className="error">{settingsErr}</span> : null}
          </div>
        </div>
      ) : null}

      <p className="muted">
        Workspace <code>{workspaceId}</code> · project <code>{projectId}</code>
        {payload?.project_name !== undefined ? (
          <>
            {" "}
            · <span>{payload.project_name}</span>
          </>
        ) : null}
        <br />
        GHL location <code>{payload?.location_id ?? "..."}</code> · occupation field{" "}
        <code>{payload?.occupation_field_id ?? "..."}</code>
      </p>

      <div className="tabs">
        {lines.map((line) => (
          <button
            key={line}
            type="button"
            className={line === activeLine ? "active" : ""}
            onClick={() => setActiveLine(line)}
          >
            {line}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => void refreshTraffic()}>
        Refresh
      </button>
      {loading ? <p className="muted">Loading...</p> : null}
      {error !== null ? <p className="error">{error}</p> : null}

      {payload !== null ? (
        <>
          <BreakdownTable
            title="Lead occupation"
            runs={payload.runs}
            section={payload.occupation}
          />
          <BreakdownTable
            title="Sorted lead source"
            runs={payload.runs}
            section={payload.leadSource}
          />
        </>
      ) : null}
    </div>
  );
}
