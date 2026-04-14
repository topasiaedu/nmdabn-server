"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashboardContext } from "@/components/DashboardContext";
import { BreakdownTable } from "./components/BreakdownTable";
import {
  fetchProjects,
  fetchTrafficDashboard,
  fetchTrafficLines,
  saveProjectSettings,
} from "./services/api";
import type { ProjectItem, TrafficDashboardPayload } from "./types";

type TrafficInnerProps = {
  ctx: DashboardContext;
};

function TrafficInner(props: TrafficInnerProps): React.ReactElement {
  const { ctx } = props;
  const { accessToken, workspaceId, projectId, dateFrom, dateTo } = ctx;

  const [projects, setProjects] = useState<ProjectItem[]>([]);

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
    if (workspaceId === "") {
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
  }, [accessToken, workspaceId]);

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
    if (workspaceId === "" || projectId === "") {
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
  }, [accessToken, projectId, workspaceId]);

  const canLoad =
    workspaceId !== "" && projectId !== "" && activeLine !== "";

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
        activeLine,
        dateFrom,
        dateTo
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
  }, [
    accessToken,
    activeLine,
    canLoad,
    dateFrom,
    dateTo,
    projectId,
    workspaceId,
  ]);

  useEffect(() => {
    if (canLoad) {
      void refreshTraffic();
    }
  }, [canLoad, refreshTraffic]);

  const onSaveSettings = useCallback(async (): Promise<void> => {
    if (workspaceId === "" || projectId === "") {
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
    occupationKeyDraft,
    projectId,
    projectNameDraft,
    workspaceId,
  ]);

  return (
    <div>
      <h1>Traffic dashboard</h1>

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

/**
 * Traffic breakdown by agency line (tabs) and webinar run columns; uses shared dashboard chrome.
 */
export function TrafficDashboardPage(): React.ReactElement {
  return (
    <DashboardShell>
      {(ctx) => <TrafficInner ctx={ctx} />}
    </DashboardShell>
  );
}
