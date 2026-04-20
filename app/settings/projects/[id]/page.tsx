"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Save,
  AlertCircle,
  Link as LinkIcon,
  RefreshCw,
  Trash2,
  FolderKanban,
  CheckCircle2,
  Circle,
  Users,
  Loader2,
} from "lucide-react";
import type { Json } from "@/database.types";
import { SettingsShell } from "@/components/SettingsShell";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { useSettingsContext } from "@/lib/settings-context";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  ghl_location_id: string | null;
  zoom_client_id: string | null;
  zoom_account_id: string | null;
  zoom_user_id: string | null;
  traffic_occupation_field_id: string | null;
  traffic_occupation_field_key: string | null;
  traffic_agency_line_tags: Json | null;
  traffic_breakdown_fields: Json | null;
};

/** One row in the Breakdown Fields key-value editor. */
type BreakdownFieldRow = { field_key: string; label: string };



type GhlConnectionRow = {
  id: string;
  project_id: string;
  ghl_location_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type WebinarRunRow = {
  id: string;
  project_id: string | null;
  display_label: string;
  zoom_meeting_id: string | null;
  zoom_source_type: string | null;
};

type MetaAdAccountRow = {
  id: string;
  agency_line: string;
  created_at: string;
  integration_account_id: string;
  integration_accounts: {
    display_name: string | null;
    account_id: string | null;
    expires_at: string | null;
    extra: Record<string, unknown> | null;
  } | null;
};

/** True when this run can call the Zoom participant report API. */
function webinarRunHasZoomReportConfig(r: WebinarRunRow): boolean {
  const mid = r.zoom_meeting_id;
  if (mid === null || mid.trim() === "") {
    return false;
  }
  const zst = r.zoom_source_type;
  return zst === "meeting" || zst === "webinar";
}

type ZoomBatchProgress = {
  /** 1-based index of the run currently being synced. */
  current: number;
  /** Total runs that will each call the sync API. */
  total: number;
  displayLabel: string;
  /** Journey rows inserted so far in this batch (after completed runs only). */
  insertedSoFar: number;
  /** Rows skipped so far in this batch. */
  skippedSoFar: number;
};

/** One row in the Agency Line Tags key-value editor. */
type AgencyTagRow = { code: string; tags: string };

const TABS = [
  { id: "general", label: "General" },
  { id: "ghl", label: "GoHighLevel" },
  { id: "zoom", label: "Zoom" },
  { id: "runs", label: "Webinar Runs" },
  { id: "traffic", label: "Traffic" },
  { id: "meta", label: "Meta Ads" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ProjectSettingsContent(): React.ReactElement {
  const { accessToken, workspaceId } = useSettingsContext();
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentTab = (searchParams.get("tab") as TabId | null) ?? "general";

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [ghlConnections, setGhlConnections] = useState<GhlConnectionRow[]>([]);
  const [webinarRuns, setWebinarRuns] = useState<WebinarRunRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  // Zoom credential form state
  const [zoomClientId, setZoomClientId] = useState("");
  const [zoomAccountIdField, setZoomAccountIdField] = useState("");
  const [zoomClientSecret, setZoomClientSecret] = useState("");
  const [zoomUserId, setZoomUserId] = useState("");
  const [occupationFieldKey, setOccupationFieldKey] = useState("");
  // Agency Line Tags key-value editor rows
  const [agencyTagRows, setAgencyTagRows] = useState<AgencyTagRow[]>([{ code: "", tags: "" }]);
  // Breakdown Fields editor rows
  const [breakdownFields, setBreakdownFields] = useState<BreakdownFieldRow[]>([
    { field_key: "", label: "" },
  ]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ghlFormLocation, setGhlFormLocation] = useState("");
  const [ghlFormToken, setGhlFormToken] = useState("");
  const [ghlError, setGhlError] = useState<string | null>(null);
  const [ghlOk, setGhlOk] = useState<string | null>(null);
  const [ghlSaving, setGhlSaving] = useState(false);

  const [zoomProjectSyncBusy, setZoomProjectSyncBusy] = useState(false);
  const [runZoomSyncBusyId, setRunZoomSyncBusyId] = useState<string | null>(
    null
  );
  const [zoomSyncResult, setZoomSyncResult] = useState<string | null>(null);
  const [zoomSyncError, setZoomSyncError] = useState<string | null>(null);
  const [zoomBatchProgress, setZoomBatchProgress] =
    useState<ZoomBatchProgress | null>(null);
  const [zoomSingleSyncHint, setZoomSingleSyncHint] = useState<string | null>(
    null
  );

  // Meta Ads state
  const [metaConnections, setMetaConnections] = useState<MetaAdAccountRow[]>([]);
  const [metaAgencyLine, setMetaAgencyLine] = useState("");
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [metaConnectError, setMetaConnectError] = useState<string | null>(null);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaSyncResult, setMetaSyncResult] = useState<string | null>(null);
  const [metaSyncError, setMetaSyncError] = useState<string | null>(null);
  const metaJustConnected = searchParams.get("meta_connected") === "1";

  const runsForProject = useMemo(
    () => webinarRuns.filter((r) => r.project_id === projectId),
    [webinarRuns, projectId]
  );

  const eligibleZoomRunCount = useMemo(
    () => runsForProject.filter(webinarRunHasZoomReportConfig).length,
    [runsForProject]
  );

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  const loadAll = useCallback(async (): Promise<void> => {
    if (projectId === "") {
      setLoadError("Invalid project id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const [projRes, ghlRes, runsRes, metaRes] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Workspace-Id": workspaceId,
          },
        }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/connections/ghl`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Workspace-Id": workspaceId,
          },
        }),
        fetch(
          `/api/webinar-runs?workspace_id=${encodeURIComponent(
            workspaceId
          )}&project_id=${encodeURIComponent(projectId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/connections/meta`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Workspace-Id": workspaceId,
          },
        }),
      ]);

      const projJson: unknown = await projRes.json();
      if (
        typeof projJson === "object" &&
        projJson !== null &&
        "success" in projJson &&
        projJson.success === true &&
        "data" in projJson
      ) {
        const p = (projJson as { data: ProjectRow }).data;
        setProject(p);
        setName(p.name);
        setDescription(p.description ?? "");
        setGhlLocationId(p.ghl_location_id ?? "");
        setZoomClientId(p.zoom_client_id ?? "");
        setZoomAccountIdField(p.zoom_account_id ?? "");
        setZoomUserId(p.zoom_user_id ?? "");
        setZoomClientSecret("");
        setOccupationFieldKey(p.traffic_occupation_field_key ?? "");
        const tagsRaw = p.traffic_agency_line_tags;
        if (
          tagsRaw !== null &&
          typeof tagsRaw === "object" &&
          !Array.isArray(tagsRaw)
        ) {
          const rows = Object.entries(tagsRaw as Record<string, unknown>).map(
            ([code, v]) => ({
              code,
              tags: Array.isArray(v)
                ? (v as string[]).filter((s) => typeof s === "string").join(", ")
                : "",
            })
          );
          setAgencyTagRows(rows.length > 0 ? rows : [{ code: "", tags: "" }]);
        } else {
          setAgencyTagRows([{ code: "", tags: "" }]);
        }

        // Initialise breakdown fields editor
        const bfRaw = p.traffic_breakdown_fields;
        if (Array.isArray(bfRaw) && bfRaw.length > 0) {
          const bfRows = bfRaw
            .filter(
              (item): item is { field_key: string; label: string } =>
                typeof item === "object" &&
                item !== null &&
                !Array.isArray(item) &&
                typeof (item as Record<string, unknown>).field_key === "string" &&
                typeof (item as Record<string, unknown>).label === "string"
            )
            .map((item) => ({
              field_key: item.field_key,
              label: item.label,
            }));
          setBreakdownFields(bfRows.length > 0 ? bfRows : [{ field_key: "", label: "" }]);
        } else {
          setBreakdownFields([{ field_key: "", label: "" }]);
        }
      } else {
        setLoadError(
          typeof projJson === "object" &&
            projJson !== null &&
            "error" in projJson &&
            typeof (projJson as { error: string }).error === "string"
            ? (projJson as { error: string }).error
            : "Failed to load project."
        );
        setLoading(false);
        return;
      }

      const ghlJson: unknown = await ghlRes.json();
      if (
        typeof ghlJson === "object" &&
        ghlJson !== null &&
        "success" in ghlJson &&
        ghlJson.success === true &&
        "data" in ghlJson &&
        Array.isArray((ghlJson as { data: unknown }).data)
      ) {
        setGhlConnections((ghlJson as { data: GhlConnectionRow[] }).data);
      }

      const runsJson: unknown = await runsRes.json();
      if (
        typeof runsJson === "object" &&
        runsJson !== null &&
        "success" in runsJson &&
        runsJson.success === true &&
        "data" in runsJson &&
        Array.isArray((runsJson as { data: unknown }).data)
      ) {
        const raw = (runsJson as { data: unknown[] }).data;
        const normalized: WebinarRunRow[] = [];
        for (const item of raw) {
          if (!isRecord(item)) {
            continue;
          }
          const id = item.id;
          const displayLabel = item.display_label;
          if (typeof id !== "string" || typeof displayLabel !== "string") {
            continue;
          }
          const pid = item.project_id;
          const zmid = item.zoom_meeting_id;
          const zst = item.zoom_source_type;
          normalized.push({
            id,
            project_id: typeof pid === "string" ? pid : null,
            display_label: displayLabel,
            zoom_meeting_id: typeof zmid === "string" ? zmid : null,
            zoom_source_type: typeof zst === "string" ? zst : null,
          });
        }
        setWebinarRuns(normalized);
      }

      const metaJson: unknown = await metaRes.json();
      if (
        typeof metaJson === "object" &&
        metaJson !== null &&
        "success" in metaJson &&
        (metaJson as { success: unknown }).success === true &&
        "data" in metaJson &&
        Array.isArray((metaJson as { data: unknown }).data)
      ) {
        setMetaConnections((metaJson as { data: MetaAdAccountRow[] }).data);
      }
    } catch {
      setLoadError("Network error loading project.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId, workspaceId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (project !== null) {
      document.title = `${project.name} — Settings — NM Media`;
    } else {
      document.title = "Settings — NM Media";
    }
  }, [project]);

  async function handleSaveProject(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(null);

    // Build agency tags object from the key-value editor rows
    const tagsObj: Record<string, string[]> = {};
    for (const row of agencyTagRows) {
      const code = row.code.trim().toUpperCase();
      if (code === "") continue;
      tagsObj[code] = row.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== "");
    }
    const parsedTags: Json =
      Object.keys(tagsObj).length > 0 ? (tagsObj as Json) : null;

    // Build breakdown fields array from the editor rows
    const bfArray = breakdownFields
      .filter((row) => row.field_key.trim() !== "")
      .map((row) => ({
        field_key: row.field_key.trim(),
        label: row.label.trim() !== "" ? row.label.trim() : row.field_key.trim(),
      }));
    const parsedBreakdownFields: Json = bfArray.length > 0 ? (bfArray as Json) : null;

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
        ghl_location_id: ghlLocationId.trim() === "" ? null : ghlLocationId.trim(),
        zoom_client_id: zoomClientId.trim() === "" ? null : zoomClientId.trim(),
        zoom_account_id: zoomAccountIdField.trim() === "" ? null : zoomAccountIdField.trim(),
        zoom_user_id: zoomUserId.trim() === "" ? null : zoomUserId.trim().toLowerCase(),
        traffic_occupation_field_key: occupationFieldKey.trim() === "" ? null : occupationFieldKey.trim(),
        traffic_agency_line_tags: parsedTags,
        traffic_breakdown_fields: parsedBreakdownFields,
      };
      // Only send the secret when the user has typed one (avoids overwriting with blank)
      if (zoomClientSecret.trim() !== "") {
        body.zoom_client_secret = zoomClientSecret;
      }

      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        json.success === true
      ) {
        setSaveOk("Project saved successfully.");
        void loadAll();
      } else {
        setSaveError(
          typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error: string }).error === "string"
            ? (json as { error: string }).error
            : "Unexpected response."
        );
      }
    } catch {
      setSaveError("Network error saving project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGhl(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setGhlError(null);
    setGhlOk(null);

    if (ghlFormLocation.trim() === "" || ghlFormToken === "") {
      setGhlError("GHL location ID and private integration token are required.");
      return;
    }

    setGhlSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/connections/ghl`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            ghl_location_id: ghlFormLocation.trim(),
            private_integration_token: ghlFormToken,
          }),
        }
      );
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true
      ) {
        setGhlOk("GHL connection created.");
        setGhlFormToken("");
        setGhlFormLocation("");
        void loadAll();
      } else {
        setGhlError(
          typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error: string }).error === "string"
            ? (json as { error: string }).error
            : "Unexpected response."
        );
      }
    } catch {
      setGhlError("Network error linking GoHighLevel.");
    } finally {
      setGhlSaving(false);
    }
  }

  function handleTabChange(tabId: string): void {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tabId);
    router.push(`/settings/projects/${projectId}?${params.toString()}`);
  }

  /**
   * Syncs Zoom attendees run-by-run so the UI can show progress (one HTTP
   * request per webinar run; same API as “Sync this run”).
   */
  async function handleSyncZoomAttendeesForProject(): Promise<void> {
    const toSync = runsForProject.filter(webinarRunHasZoomReportConfig);
    const skippedNoZoom = runsForProject.length - toSync.length;

    if (toSync.length === 0) {
      setZoomSyncResult(null);
      setZoomSyncError(
        skippedNoZoom === 0
          ? "No webinar runs for this project."
          : "No runs have a Zoom meeting ID and type (meeting or webinar). Add them under Manage Runs."
      );
      return;
    }

    setZoomProjectSyncBusy(true);
    setZoomSyncResult(null);
    setZoomSyncError(null);
    setZoomBatchProgress(null);

    let inserted = 0;
    let skipped = 0;
    const runErrors: string[] = [];

    try {
      for (let i = 0; i < toSync.length; i += 1) {
        const r = toSync[i];
        setZoomBatchProgress({
          current: i + 1,
          total: toSync.length,
          displayLabel: r.display_label,
          insertedSoFar: inserted,
          skippedSoFar: skipped,
        });

        const res = await fetch("/api/actions/sync/zoom", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Workspace-Id": workspaceId,
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            webinar_run_id: r.id,
          }),
        });

        const json: unknown = await res.json();
        if (!isRecord(json) || json.success !== true) {
          const err =
            isRecord(json) && typeof json.error === "string"
              ? json.error
              : `Request failed (${String(res.status)})`;
          runErrors.push(`${r.display_label}: ${err}`);
          continue;
        }
        inserted +=
          typeof json.inserted === "number" ? json.inserted : 0;
        skipped +=
          typeof json.skipped === "number" ? json.skipped : 0;

        setZoomBatchProgress({
          current: i + 1,
          total: toSync.length,
          displayLabel: r.display_label,
          insertedSoFar: inserted,
          skippedSoFar: skipped,
        });
      }

      const parts = [
        `Done: ${inserted} attendee row(s) inserted, ${skipped} skipped (already recorded or missing email).`,
      ];
      if (skippedNoZoom > 0) {
        parts.push(
          `${String(skippedNoZoom)} run(s) were skipped (no Zoom meeting configured).`
        );
      }
      if (runErrors.length > 0) {
        const preview = runErrors.slice(0, 4).join(" · ");
        parts.push(
          `${String(runErrors.length)} run(s) failed: ${preview}${
            runErrors.length > 4 ? "…" : ""
          }`
        );
      }
      setZoomSyncResult(parts.join(" "));
    } catch {
      setZoomSyncError("Network error during Zoom sync.");
    } finally {
      setZoomBatchProgress(null);
      setZoomProjectSyncBusy(false);
    }
  }

  /**
   * Sync Zoom participants for a single webinar run (same API as project-wide,
   * but body uses `webinar_run_id`).
   */
  async function handleSyncZoomAttendeesForRun(
    runId: string,
    displayLabel: string
  ): Promise<void> {
    setRunZoomSyncBusyId(runId);
    setZoomSyncResult(null);
    setZoomSyncError(null);
    setZoomSingleSyncHint(`Calling Zoom for "${displayLabel}"…`);
    try {
      const res = await fetch("/api/actions/sync/zoom", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Workspace-Id": workspaceId,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          webinar_run_id: runId,
        }),
      });
      const json: unknown = await res.json();
      if (!isRecord(json)) {
        setZoomSyncError("Invalid response from server.");
        return;
      }
      if (json.success !== true) {
        const err = json.error;
        setZoomSyncError(
          typeof err === "string" ? err : "Zoom sync failed."
        );
        return;
      }
      const inserted =
        typeof json.inserted === "number" ? json.inserted : 0;
      const skipped =
        typeof json.skipped === "number" ? json.skipped : 0;
      setZoomSyncResult(
        `Run synced: ${inserted} inserted, ${skipped} skipped.`
      );
    } catch {
      setZoomSyncError("Network error calling Zoom sync.");
    } finally {
      setZoomSingleSyncHint(null);
      setRunZoomSyncBusyId(null);
    }
  }

  /** Initiates Meta OAuth flow: calls authorize endpoint, then redirects to Meta. */
  async function handleConnectMeta(): Promise<void> {
    const line = metaAgencyLine.trim();
    if (line === "") {
      setMetaConnectError("Agency line is required (e.g. OM, NM).");
      return;
    }
    setMetaConnecting(true);
    setMetaConnectError(null);
    try {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        project_id: projectId,
        agency_line: line,
      });
      const res = await fetch(`/api/auth/meta/authorize?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true &&
        "data" in json &&
        typeof (json as { data: unknown }).data === "object" &&
        (json as { data: unknown }).data !== null
      ) {
        const authUrl = (json as { data: { authUrl: string } }).data.authUrl;
        globalThis.location.href = authUrl;
        return;
      }
      const errMsg =
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error: string }).error === "string"
          ? (json as { error: string }).error
          : "Failed to get authorization URL.";
      setMetaConnectError(errMsg);
    } catch {
      setMetaConnectError("Network error starting Meta connection.");
    } finally {
      setMetaConnecting(false);
    }
  }

  /** Triggers Meta Ads sync for all linked accounts on this project. */
  async function handleSyncMeta(): Promise<void> {
    setMetaSyncing(true);
    setMetaSyncResult(null);
    setMetaSyncError(null);
    try {
      const res = await fetch("/api/actions/sync/meta-ads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspace_id: workspaceId, project_id: projectId }),
      });
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true
      ) {
        const j = json as Record<string, unknown>;
        const accounts = typeof j.accountsSynced === "number" ? j.accountsSynced : 0;
        const campaigns = typeof j.campaignsSynced === "number" ? j.campaignsSynced : 0;
        const insights = typeof j.insightRowsSynced === "number" ? j.insightRowsSynced : 0;
        setMetaSyncResult(
          `Synced ${String(accounts)} account(s), ${String(campaigns)} campaign(s), ${String(insights)} insight rows.`
        );
      } else {
        const errMsg =
          typeof json === "object" &&
          json !== null &&
          "error" in json &&
          typeof (json as { error: string }).error === "string"
            ? (json as { error: string }).error
            : "Meta sync failed.";
        setMetaSyncError(errMsg);
      }
    } catch {
      setMetaSyncError("Network error during Meta sync.");
    } finally {
      setMetaSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex bg-slate-50 min-h-[calc(100vh-56px)]">
        <SettingsSidebar />
        <div className="flex-1 p-8 max-w-4xl flex items-center justify-center text-slate-500">
          Loading project...
        </div>
      </div>
    );
  }

  if (loadError !== null || project === null) {
    return (
      <div className="flex bg-slate-50 min-h-[calc(100vh-56px)]">
        <SettingsSidebar />
        <div className="flex-1 p-8 max-w-4xl">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {loadError ?? "Project not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-slate-50 min-h-[calc(100vh-56px)]">
      <SettingsSidebar />
      <div className="flex-1 p-8 max-w-4xl">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FolderKanban size={16} />
              <span>Projects</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>
          </div>
          <button
            type="submit"
            form="project-settings-form"
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {saveError !== null && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        {saveOk !== null && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-start gap-2">
            <RefreshCw size={16} className="mt-0.5 shrink-0" />
            <span>{saveOk}</span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  currentTab === tab.id
                    ? "border-indigo-600 text-indigo-700 bg-white"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            <form id="project-settings-form" onSubmit={(e) => void handleSaveProject(e)}>
              {/* ── General Tab ──────────────────────────────────────────────── */}
              <div className={currentTab === "general" ? "block space-y-6" : "hidden"}>
                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Project Name</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Internal display name for this project.
                    </p>
                  </div>
                  <div>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Description</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Optional details about this project.
                    </p>
                  </div>
                  <div>
                    <textarea
                      rows={3}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resiae-y"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Project ID</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      System identifier for database records.
                    </p>
                  </div>
                  <div>
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 block w-full truncate select-all">
                      {project.id}
                    </code>
                  </div>
                </div>

                {/* ── Setup Status Checklist ─────────────────────────────────── */}
                <div className="max-w-2xl border-t border-slate-100 pt-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-1">Setup Status</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    All three items below must be configured before webinar sync works.
                  </p>
                  <ul className="space-y-3">
                    {/* GHL */}
                    <li className="flex items-center gap-3">
                      {ghlConnections.length > 0 ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      ) : (
                        <Circle size={16} className="text-slate-300 shrink-0" />
                      )}
                      <span className={`text-sm ${ghlConnections.length > 0 ? "text-slate-700" : "text-slate-400"}`}>
                        GoHighLevel sub-account connected
                        {ghlConnections.length > 0 && (
                          <span className="ml-2 text-xs text-slate-400">({ghlConnections.length} linked)</span>
                        )}
                      </span>
                      {ghlConnections.length === 0 && (
                        <button
                          type="button"
                          onClick={() => handleTabChange("ghl")}
                          className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          Set up →
                        </button>
                      )}
                    </li>
                    {/* Zoom */}
                    <li className="flex items-center gap-3">
                      {project.zoom_client_id !== null && project.zoom_client_id !== "" ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      ) : (
                        <Circle size={16} className="text-slate-300 shrink-0" />
                      )}
                      <span className={`text-sm ${project.zoom_client_id ? "text-slate-700" : "text-slate-400"}`}>
                        Zoom credentials configured
                        {project.zoom_client_id !== null && project.zoom_client_id !== "" && (
                          <span className="ml-2 text-xs font-mono text-slate-400">{project.zoom_client_id}</span>
                        )}
                      </span>
                      {(project.zoom_client_id === null || project.zoom_client_id === "") && (
                        <button
                          type="button"
                          onClick={() => handleTabChange("zoom")}
                          className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          Set up →
                        </button>
                      )}
                    </li>
                    {/* Webinar Runs */}
                    <li className="flex items-center gap-3">
                      {runsForProject.length > 0 ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      ) : (
                        <Circle size={16} className="text-slate-300 shrink-0" />
                      )}
                      <span className={`text-sm ${runsForProject.length > 0 ? "text-slate-700" : "text-slate-400"}`}>
                        Webinar runs configured
                        {runsForProject.length > 0 && (
                          <span className="ml-2 text-xs text-slate-400">({runsForProject.length} run{runsForProject.length !== 1 ? "s" : ""})</span>
                        )}
                      </span>
                      {runsForProject.length === 0 && (
                        <Link
                          href={`/settings/integrations?project=${projectId}`}
                          className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          Add runs →
                        </Link>
                      )}
                    </li>
                  </ul>
                </div>

                {/* Save button for General tab */}
                <div className="border-t border-slate-100 pt-6 flex justify-end max-w-2xl">
                  <button
                    type="submit"
                    form="project-settings-form"
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              {/* ── Traffic Tab ──────────────────────────────────────────────── */}
              <div className={currentTab === "traffic" ? "block space-y-6" : "hidden"}>

                {/* Breakdown Fields editor */}
                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-3xl">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Breakdown Fields</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      GHL custom fields to analyse in the dashboards (e.g. Occupation, Annual Income).
                      Each field will appear as a separate section in Traffic, Show Up, and Buyer Behavior dashboards.
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      Find field keys in GHL → Settings → Custom Fields (e.g.{" "}
                      <code className="bg-slate-100 px-1 rounded text-slate-700">contact.occupation</code>).
                    </p>
                  </div>
                  <div className="space-y-2">
                    {/* Column headers */}
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      <span className="flex-1">Field Key (from GHL)</span>
                      <span className="flex-1">Display Label</span>
                      <span className="w-6" />
                    </div>
                    {breakdownFields.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="contact.occupation"
                          value={row.field_key}
                          onChange={(e) => {
                            const updated = [...breakdownFields];
                            updated[idx] = { ...updated[idx], field_key: e.target.value };
                            setBreakdownFields(updated);
                          }}
                        />
                        <input
                          type="text"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Lead Occupation"
                          value={row.label}
                          onChange={(e) => {
                            const updated = [...breakdownFields];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setBreakdownFields(updated);
                          }}
                        />
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 shrink-0"
                          onClick={() => {
                            const updated = breakdownFields.filter((_, i) => i !== idx);
                            setBreakdownFields(
                              updated.length > 0 ? updated : [{ field_key: "", label: "" }]
                            );
                          }}
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      onClick={() =>
                        setBreakdownFields([...breakdownFields, { field_key: "", label: "" }])
                      }
                    >
                      + Add breakdown field
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-3xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Agency Line Tags</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Maps each agency category code (e.g. <code className="bg-slate-100 px-1 rounded text-slate-700">OM</code>, <code className="bg-slate-100 px-1 rounded text-slate-700">NM</code>) to the
                      GHL contact tags that identify a lead as belonging to that agency line.
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      Codes are auto-uppercased. Tags are comma-separated GHL tag strings.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {agencyTagRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono text-slate-900 uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g. OM"
                          value={row.code}
                          onChange={(e) => {
                            const updated = [...agencyTagRows];
                            updated[idx] = { ...updated[idx], code: e.target.value };
                            setAgencyTagRows(updated);
                          }}
                        />
                        <span className="text-slate-400 text-sm shrink-0">→</span>
                        <input
                          type="text"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="tag1, tag2, tag3"
                          value={row.tags}
                          onChange={(e) => {
                            const updated = [...agencyTagRows];
                            updated[idx] = { ...updated[idx], tags: e.target.value };
                            setAgencyTagRows(updated);
                          }}
                        />
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 shrink-0"
                          onClick={() => {
                            const updated = agencyTagRows.filter((_, i) => i !== idx);
                            setAgencyTagRows(updated.length > 0 ? updated : [{ code: "", tags: "" }]);
                          }}
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      onClick={() => setAgencyTagRows([...agencyTagRows, { code: "", tags: "" }])}
                    >
                      + Add agency line
                    </button>
                  </div>
                </div>

                {/* Save button for Traffic tab */}
                <div className="border-t border-slate-100 pt-6 flex justify-end max-w-3xl">
                  <button
                    type="submit"
                    form="project-settings-form"
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              {/* ── Zoom Tab ─────────────────────────────────────────────────── */}
              <div className={currentTab === "zoom" ? "block space-y-6" : "hidden"}>

                {/* How to find these guide */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-w-2xl text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800 mb-2">Where to find these credentials</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Log in to the client&apos;s Zoom account at <span className="font-mono text-slate-700">marketplace.zoom.us</span></li>
                    <li>Go to <strong>Develop → Build App</strong> and open (or create) a <strong>Server-to-Server OAuth</strong> app</li>
                    <li>Copy <strong>Account ID</strong>, <strong>Client ID</strong>, and <strong>Client Secret</strong> from the App Credentials page</li>
                    <li>Make sure the app has the <strong>Report: Read:Admin</strong> and <strong>Webinar: Read:Admin</strong> scopes and is <strong>Activated</strong></li>
                    <li>Enter the <strong>Host Email</strong> — the Zoom user whose webinars/meetings belong to this project (may differ from the account owner)</li>
                  </ol>
                </div>

                {/* Status banner */}
                {project.zoom_client_id !== null && project.zoom_client_id !== "" ? (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 max-w-2xl">
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-emerald-800">
                      <p className="font-medium">Zoom credentials are saved.</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Client ID: <code className="font-mono">{project.zoom_client_id}</code>
                        {" · "}Account ID: <code className="font-mono">{project.zoom_account_id ?? "—"}</code>
                        {" · "}Secret: <span className="italic">stored encrypted</span>
                        {project.zoom_user_id !== null && project.zoom_user_id !== "" && (
                          <>{" · "}Host: <code className="font-mono">{project.zoom_user_id}</code></>
                        )}
                      </p>
                      {(project.zoom_user_id === null || project.zoom_user_id === "") && (
                        <p className="text-xs text-amber-700 mt-1 font-medium">⚠ Host Email not set — add it below so we know whose meetings to fetch.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 max-w-2xl">
                    <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">No Zoom credentials saved yet.</p>
                      <p className="text-xs text-amber-700 mt-0.5">Fill in all four fields below and click Save Zoom Credentials.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Client ID</h3>
                    <p className="text-xs text-slate-500 mt-1">Found on the App Credentials page in Zoom Marketplace.</p>
                  </div>
                  <input
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={zoomClientId}
                    onChange={(e) => setZoomClientId(e.target.value)}
                    placeholder="e.g. F6FdkKrZQ2mPtCaQkK2M8w"
                  />
                </div>

                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Account ID</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      The Zoom <em>Account</em> ID — not a meeting or webinar ID.
                      Found on the same App Credentials page.
                    </p>
                  </div>
                  <input
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={zoomAccountIdField}
                    onChange={(e) => setZoomAccountIdField(e.target.value)}
                    placeholder="e.g. bjKMvcPJRHymiaxkXkXgjA"
                  />
                </div>

                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Client Secret</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {project.zoom_client_id !== null && project.zoom_client_id !== ""
                        ? "A secret is already saved. Enter a new value only if you need to rotate it."
                        : "Required for the first setup. Stored encrypted — never shown again after saving."}
                    </p>
                  </div>
                  <div>
                    <input
                      type="password"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={zoomClientSecret}
                      onChange={(e) => setZoomClientSecret(e.target.value)}
                      placeholder={
                        project.zoom_client_id !== null && project.zoom_client_id !== ""
                          ? "Leave blank to keep current secret"
                          : "Enter Client Secret"
                      }
                      autoComplete="off"
                    />
                    <p className="mt-1.5 text-xs text-slate-400">
                      Credentials are verified against Zoom&apos;s API when you save. If the test fails, nothing is stored.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl border-t border-slate-100 pt-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Host Email</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      The email of the Zoom user who runs webinars / meetings for this project.
                      For sub-accounts sharing the same S2S app (e.g. <code className="font-mono">askcae@topasiaedu.com</code>),
                      enter their email. For external clients, enter their host email.
                    </p>
                  </div>
                  <div>
                    <input
                      type="email"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={zoomUserId}
                      onChange={(e) => setZoomUserId(e.target.value)}
                      placeholder="e.g. askcae@topasiaedu.com"
                      autoComplete="off"
                    />
                    <p className="mt-1.5 text-xs text-slate-400">
                      This tells the app whose Zoom calendar to fetch — not the account owner&apos;s.
                    </p>
                  </div>
                </div>

                {/* Save button for Zoom tab */}
                <div className="border-t border-slate-100 pt-6 flex justify-end max-w-2xl">
                  <button
                    type="submit"
                    form="project-settings-form"
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save Zoom Credentials"}
                  </button>
                </div>
              </div>

              {/* ── GoHighLevel Tab ──────────────────────────────────────────── */}
              <div className={currentTab === "ghl" ? "block space-y-6" : "hidden"}>
                <div className="grid grid-cols-[1fr,2fr] gap-6 max-w-2xl">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Primary Location ID</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      The main GHL sub-account location ID for this project. Used as the default when looking up contacts.
                    </p>
                  </div>
                  <div>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      value={ghlLocationId}
                      onChange={(e) => setGhlLocationId(e.target.value)}
                      placeholder="e.g. kH9zbk..."
                    />
                  </div>
                </div>

                {/* Save button for GHL primary location field */}
                <div className="border-t border-slate-100 pt-6 flex justify-end max-w-2xl">
                  <button
                    type="submit"
                    form="project-settings-form"
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>

            {/* GHL Connections Sub-Form - Outside main form */}
            {currentTab === "ghl" && (
              <div className="mt-10 border-t border-slate-200 pt-8 max-w-3xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Linked GHL Sub-accounts</h3>
                </div>
                {ghlConnections.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500 mb-6">
                    No API connections added yet.
                  </div>
                ) : (
                  <ul className="mb-6 border border-slate-200 bg-white rounded-lg divide-y divide-slate-100">
                    {ghlConnections.map((c) => (
                      <li key={c.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${c.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                          <code className="text-sm text-slate-800 bg-slate-50 px-2 py-0.5 rounded font-mono">
                            {c.ghl_location_id}
                          </code>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>Added {new Date(c.created_at).toLocaleDateString()}</span>
                          <button type="button" className="text-red-500 hover:text-red-700 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                  <h4 className="text-sm font-medium text-slate-900 mb-4 flex items-center gap-2">
                    <LinkIcon size={16} className="text-slate-500" />
                    New Integration Token
                  </h4>
                  <form onSubmit={(e) => void handleAddGhl(e)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-700 block mb-1">Location ID</span>
                        <input
                          className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={ghlFormLocation}
                          onChange={(e) => setGhlFormLocation(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-700 block mb-1">Private Auth Token</span>
                        <input
                          type="password"
                          className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={ghlFormToken}
                          onChange={(e) => setGhlFormToken(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    {ghlError !== null && <p className="text-sm text-red-600">{ghlError}</p>}
                    {ghlOk !== null && <p className="text-sm text-emerald-600">{ghlOk}</p>}
                    <button
                      type="submit"
                      disabled={ghlSaving}
                      className="bg-white border border-slate-300 text-slate-700 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {ghlSaving ? "Saving..." : "Add Connection"}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ── Webinar Runs Tab  ────────────────────────────────────────── */}
            {currentTab === "runs" && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Configured Runs</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      Pull Zoom participant reports into journey events (attendance) for this project.
                      Runs need a Zoom meeting ID and type (meeting or webinar) set under Integrations.
                      Re-running sync is safe: existing attendees stay skipped.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={
                        zoomProjectSyncBusy ||
                        runZoomSyncBusyId !== null ||
                        eligibleZoomRunCount === 0
                      }
                      onClick={() => void handleSyncZoomAttendeesForProject()}
                      className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      {zoomProjectSyncBusy ? (
                        <Loader2 size={16} className="animate-spin shrink-0" />
                      ) : (
                        <Users size={16} className="shrink-0" />
                      )}
                      {zoomProjectSyncBusy
                        ? "Syncing Zoom…"
                        : "Sync Zoom attendees (all runs)"}
                    </button>
                    <Link
                      href={`/settings/integrations?project=${projectId}`}
                      className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      Manage Runs →
                    </Link>
                  </div>
                </div>

                {runsForProject.length > 0 && eligibleZoomRunCount === 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Bulk sync is disabled until at least one run has a Zoom meeting ID
                    and type (meeting or webinar). Use Manage Runs to configure them.
                  </p>
                )}

                {zoomProjectSyncBusy && zoomBatchProgress !== null && (
                  <div
                    className="border border-indigo-200 bg-indigo-50/90 rounded-lg p-4 space-y-3"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-indigo-900">
                      <span className="flex items-center gap-2">
                        <Loader2
                          size={14}
                          className="animate-spin text-indigo-600 shrink-0"
                          aria-hidden
                        />
                        Zoom attendee sync
                      </span>
                      <span>
                        Run {zoomBatchProgress.current} / {zoomBatchProgress.total}
                      </span>
                    </div>
                    <div
                      className="h-2.5 bg-indigo-100 rounded-full overflow-hidden"
                      aria-hidden
                    >
                      <div
                        className="h-full bg-indigo-600 transition-[width] duration-300 ease-out"
                        style={{
                          width: `${Math.round(
                            (zoomBatchProgress.current /
                              zoomBatchProgress.total) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-sm text-indigo-950 leading-snug">
                      <span className="font-semibold">
                        {zoomBatchProgress.displayLabel}
                      </span>
                      <span className="text-indigo-800">
                        {" "}
                        — fetching participants from Zoom (this can take a while
                        per run).
                      </span>
                    </p>
                    <p className="text-xs text-indigo-800/90 tabular-nums">
                      Totals so far:{" "}
                      <span className="font-semibold text-indigo-950">
                        {zoomBatchProgress.insertedSoFar} inserted
                      </span>
                      {" · "}
                      <span className="font-semibold text-indigo-950">
                        {zoomBatchProgress.skippedSoFar} skipped
                      </span>
                    </p>
                  </div>
                )}

                {zoomSingleSyncHint !== null && (
                  <div
                    className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 flex items-center gap-2"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span>{zoomSingleSyncHint}</span>
                  </div>
                )}

                {zoomSyncError !== null && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{zoomSyncError}</span>
                  </div>
                )}
                {zoomSyncResult !== null && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span>{zoomSyncResult}</span>
                  </div>
                )}

                {runsForProject.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
                    No webinar runs configured for this project.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm text-left min-w-[640px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Label</th>
                          <th className="px-4 py-3 font-semibold">Zoom meeting ID</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-4 py-3 font-semibold text-right w-40">
                            Zoom sync
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                        {runsForProject.map((r) => {
                          const hasZoom =
                            r.zoom_meeting_id !== null &&
                            r.zoom_meeting_id.trim() !== "";
                          const rowBusy = runZoomSyncBusyId === r.id;
                          return (
                            <tr key={r.id}>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {r.display_label}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600 text-xs">
                                {r.zoom_meeting_id ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-600 capitalize">
                                {r.zoom_source_type ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  disabled={
                                    !hasZoom ||
                                    rowBusy ||
                                    zoomProjectSyncBusy
                                  }
                                  title={
                                    hasZoom
                                      ? "Pull participants for this run only"
                                      : "Set Zoom meeting ID on this run first"
                                  }
                                  onClick={() =>
                                    void handleSyncZoomAttendeesForRun(
                                      r.id,
                                      r.display_label
                                    )
                                  }
                                  className="text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 px-2.5 py-1.5 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {rowBusy ? "Syncing…" : "Sync this run"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Meta Ads Tab — outside main form (OAuth flow, not a save) ── */}
            {currentTab === "meta" && (
              <div className="space-y-6">

                {/* Success banner after OAuth redirect */}
                {metaJustConnected && (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 max-w-2xl">
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-emerald-800">
                      <p className="font-medium">Meta Ads account connected successfully.</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        The account is now linked to this project. Use the Sync button below to pull the first batch of campaigns and insights.
                      </p>
                    </div>
                  </div>
                )}

                {/* Connected accounts list */}
                <div className="max-w-2xl">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">Connected Ad Accounts</h3>
                  {metaConnections.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
                      No Meta ad accounts linked yet. Use the Connect button below to add one.
                    </div>
                  ) : (
                    <ul className="border border-slate-200 bg-white rounded-lg divide-y divide-slate-100 mb-4">
                      {metaConnections.map((conn) => {
                        const acc = conn.integration_accounts;
                        const expiresAt =
                          acc?.expires_at !== null && acc?.expires_at !== undefined
                            ? new Date(acc.expires_at)
                            : null;
                        const isExpired = expiresAt !== null && expiresAt < new Date();
                        const extraCurrency =
                          acc?.extra !== null &&
                          acc?.extra !== undefined &&
                          typeof acc.extra.currency === "string"
                            ? acc.extra.currency
                            : null;
                        return (
                          <li key={conn.id} className="p-4 flex items-start justify-between gap-4">
                            <div className="space-y-0.5 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {acc?.display_name ?? acc?.account_id ?? conn.integration_account_id}
                              </p>
                              <p className="text-xs text-slate-500 font-mono">
                                {acc?.account_id ?? "—"}
                                {extraCurrency !== null && (
                                  <span className="ml-2 normal-case font-sans text-slate-400">{extraCurrency}</span>
                                )}
                              </p>
                              <p className="text-xs text-slate-400">
                                Agency line:{" "}
                                <span className="font-semibold text-slate-600">{conn.agency_line}</span>
                                {" · "}Connected {new Date(conn.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {isExpired && (
                                <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                  Token expired
                                </span>
                              )}
                              {!isExpired && expiresAt !== null && (
                                <span className="text-xs text-slate-400">
                                  Expires {expiresAt.toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Sync */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={metaSyncing || metaConnections.length === 0}
                      onClick={() => void handleSyncMeta()}
                      className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {metaSyncing ? (
                        <Loader2 size={16} className="animate-spin shrink-0" />
                      ) : (
                        <RefreshCw size={16} className="shrink-0" />
                      )}
                      {metaSyncing ? "Syncing…" : "Sync Meta Ads now"}
                    </button>
                  </div>
                  {metaSyncResult !== null && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                      <span>{metaSyncResult}</span>
                    </div>
                  )}
                  {metaSyncError !== null && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{metaSyncError}</span>
                    </div>
                  )}
                </div>

                {/* Connect new account */}
                <div className="max-w-2xl border-t border-slate-100 pt-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-1">Connect a Meta Ad Account</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Each agency line can have its own Meta ad account. You will be redirected to Meta to
                    authorize access. The token lasts ~60 days and will auto-refresh when syncing.
                  </p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                    <label className="block max-w-xs">
                      <span className="text-xs font-medium text-slate-700 block mb-1 uppercase tracking-wide">
                        Agency Line Code
                      </span>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-slate-900 uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g. OM"
                        value={metaAgencyLine}
                        onChange={(e) => setMetaAgencyLine(e.target.value.toUpperCase())}
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Must match the agency line codes configured in the Traffic tab.
                      </p>
                    </label>
                    {metaConnectError !== null && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{metaConnectError}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={metaConnecting}
                      onClick={() => void handleConnectMeta()}
                      className="flex items-center gap-2 bg-[#1877F2] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#166FE5] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {metaConnecting ? (
                        <Loader2 size={16} className="animate-spin shrink-0" />
                      ) : (
                        <LinkIcon size={16} className="shrink-0" />
                      )}
                      {metaConnecting ? "Redirecting to Meta…" : "Connect with Meta"}
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectSettingsPage(): React.ReactElement {
  return (
    <SettingsShell>
      <ProjectSettingsContent />
    </SettingsShell>
  );
}
