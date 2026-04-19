"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, RefreshCw, CheckSquare, Square } from "lucide-react";
import { SettingsShell } from "@/components/SettingsShell";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { useSettingsContext } from "@/lib/settings-context";

// --- Types ---

type WebinarRunRow = {
  id: string;
  project_id: string | null;
  display_label: string;
  event_start_at: string;
  event_end_at: string;
  zoom_meeting_id: string | null;
  zoom_source_type: string | null;
  is_active: boolean;
  sort_order: number | null;
};

type ProjectOption = {
  id: string;
  name: string;
};

type ZoomEventItem = {
  zoom_id: string;
  topic: string;
  start_time: string;
  duration_minutes: number;
  timezone: string;
  zoom_source_type: "webinar" | "meeting";
};

type DraftFields = {
  project_id: string;
  display_label: string;
  event_start_local: string;
  event_end_local: string;
  zoom_meeting_id: string;
  zoom_source_type: "" | "meeting" | "webinar";
  is_active: boolean;
  sort_order: string;
};

// --- Helpers ---

/** Returns a human-readable date/time string from an ISO timestamp. */
function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Returns ISO string for event end = start + duration minutes. */
function computeEndIso(startIso: string, durationMinutes: number): string {
  const ms = Date.parse(startIso);
  if (Number.isNaN(ms)) return startIso;
  return new Date(ms + durationMinutes * 60_000).toISOString();
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string {
  const ms = Date.parse(local);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString();
}

function runToDraft(run: WebinarRunRow): DraftFields {
  return {
    project_id: run.project_id ?? "",
    display_label: run.display_label,
    event_start_local: isoToDatetimeLocal(run.event_start_at),
    event_end_local: isoToDatetimeLocal(run.event_end_at),
    zoom_meeting_id: run.zoom_meeting_id ?? "",
    zoom_source_type:
      run.zoom_source_type === "meeting" || run.zoom_source_type === "webinar"
        ? run.zoom_source_type
        : "",
    is_active: run.is_active,
    sort_order: run.sort_order === null ? "" : String(run.sort_order),
  };
}

// --- Zoom credentials are now configured per-project (see Project Settings → Zoom tab) ---

// --- Webinar Runs Component ---
function WebinarRunsTab() {
  const { accessToken, workspaceId } = useSettingsContext();
  const searchParams = useSearchParams();
  const defaultProjectId = searchParams.get("project") ?? "";

  const [runs, setRuns] = useState<WebinarRunRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createDraft, setCreateDraft] = useState<DraftFields>({
    project_id: defaultProjectId,
    display_label: "",
    event_start_local: "",
    event_end_local: "",
    zoom_meeting_id: "",
    zoom_source_type: "",
    is_active: true,
    sort_order: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Zoom import state
  const [zoomImportOpen, setZoomImportOpen] = useState(false);
  const [zoomEvents, setZoomEvents] = useState<ZoomEventItem[]>([]);
  const [zoomEventsLoading, setZoomEventsLoading] = useState(false);
  const [zoomEventsError, setZoomEventsError] = useState<string | null>(null);
  const [selectedZoomIds, setSelectedZoomIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; failed: number } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadRuns = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [runsRes, projRes] = await Promise.all([
        fetch(`/api/webinar-runs?workspace_id=${encodeURIComponent(workspaceId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`/api/projects?workspace_id=${encodeURIComponent(workspaceId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      const runsJson: unknown = await runsRes.json();
      if (
        typeof runsJson === "object" &&
        runsJson !== null &&
        "success" in runsJson &&
        (runsJson as { success: unknown }).success === true &&
        "data" in runsJson &&
        Array.isArray((runsJson as { data: unknown }).data)
      ) {
        setRuns((runsJson as { data: WebinarRunRow[] }).data);
      } else {
        setLoadError("Unexpected response loading webinar runs.");
      }

      const projJson: unknown = await projRes.json();
      if (
        typeof projJson === "object" &&
        projJson !== null &&
        "success" in projJson &&
        (projJson as { success: unknown }).success === true &&
        "data" in projJson &&
        Array.isArray((projJson as { data: unknown }).data)
      ) {
        setProjects(
          (projJson as { data: ProjectOption[] }).data.map((p) => ({
            id: p.id,
            name: p.name,
          }))
        );
      }
    } catch {
      setLoadError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function fetchZoomEvents(projectId: string): Promise<void> {
    setZoomEventsLoading(true);
    setZoomEventsError(null);
    setZoomEvents([]);
    setSelectedZoomIds(new Set());
    setImportResult(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/zoom-events?workspace_id=${encodeURIComponent(workspaceId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true &&
        "data" in json &&
        Array.isArray((json as { data: unknown }).data)
      ) {
        setZoomEvents((json as { data: ZoomEventItem[] }).data);
      } else {
        const msg =
          typeof json === "object" &&
          json !== null &&
          "error" in json &&
          typeof (json as { error: string }).error === "string"
            ? (json as { error: string }).error
            : "Failed to load Zoom events.";
        setZoomEventsError(msg);
      }
    } catch {
      setZoomEventsError("Network error loading Zoom events.");
    } finally {
      setZoomEventsLoading(false);
    }
  }

  function openZoomImport(): void {
    setZoomImportOpen(true);
    setImportResult(null);
    if (createDraft.project_id !== "") {
      void fetchZoomEvents(createDraft.project_id);
    }
  }

  function toggleZoomEvent(zoomId: string): void {
    setSelectedZoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoomId)) {
        next.delete(zoomId);
      } else {
        next.add(zoomId);
      }
      return next;
    });
  }

  function toggleSelectAll(): void {
    if (selectedZoomIds.size === zoomEvents.length) {
      setSelectedZoomIds(new Set());
    } else {
      setSelectedZoomIds(new Set(zoomEvents.map((e) => e.zoom_id)));
    }
  }

  async function handleImportSelected(): Promise<void> {
    if (selectedZoomIds.size === 0 || creating) return;
    const toImport = zoomEvents.filter((e) => selectedZoomIds.has(e.zoom_id));
    setImporting(true);
    setImportResult(null);
    let ok = 0;
    let failed = 0;
    for (const event of toImport) {
      const endIso =
        event.duration_minutes > 0
          ? computeEndIso(event.start_time, event.duration_minutes)
          : computeEndIso(event.start_time, 60);
      try {
        const res = await fetch("/api/webinar-runs", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            project_id: createDraft.project_id,
            display_label: event.topic,
            event_start_at: event.start_time,
            event_end_at: endIso,
            timezone: event.timezone,
            zoom_meeting_id: event.zoom_id,
            zoom_source_type: event.zoom_source_type,
            is_active: true,
          }),
        });
        const json: unknown = await res.json();
        if (
          typeof json === "object" &&
          json !== null &&
          "success" in json &&
          (json as { success: unknown }).success === true
        ) {
          ok += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }
    setImporting(false);
    setImportResult({ ok, failed });
    setSelectedZoomIds(new Set());
    if (ok > 0) void loadRuns();
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setCreateError(null);
    setCreateOk(null);

    const startIso = datetimeLocalToIso(createDraft.event_start_local);
    const endIso = datetimeLocalToIso(createDraft.event_end_local);
    if (startIso === "" || endIso === "") {
      setCreateError("Invalid start or end date/time.");
      return;
    }
    if (createDraft.project_id === "") {
      setCreateError("Select a project.");
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        workspace_id: workspaceId,
        project_id: createDraft.project_id,
        display_label: createDraft.display_label.trim(),
        event_start_at: startIso,
        event_end_at: endIso,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        zoom_meeting_id: createDraft.zoom_meeting_id.trim() === "" ? null : createDraft.zoom_meeting_id.trim(),
        zoom_source_type: createDraft.zoom_source_type === "" ? null : createDraft.zoom_source_type,
        is_active: createDraft.is_active,
        sort_order: createDraft.sort_order.trim() === "" ? null : Number.parseInt(createDraft.sort_order, 10),
      };

      if (body.sort_order !== null && !Number.isInteger(body.sort_order)) {
        setCreateError("Sort order must be an integer or empty.");
        setCreating(false);
        return;
      }

      const res = await fetch("/api/webinar-runs", {
        method: "POST",
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
        (json as { success: unknown }).success === true
      ) {
        setCreateOk("Webinar run created.");
        setCreateDraft({
          project_id: defaultProjectId,
          display_label: "",
          event_start_local: "",
          event_end_local: "",
          zoom_meeting_id: "",
          zoom_source_type: "",
          is_active: true,
          sort_order: "",
        });
        void loadRuns();
      } else {
        setCreateError("Unexpected response.");
      }
    } catch {
      setCreateError("Network error.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(run: WebinarRunRow): void {
    setEditingId(run.id);
    setEditDraft(runToDraft(run));
    setEditError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }

  async function saveEdit(): Promise<void> {
    if (editingId === null || editDraft === null) return;
    setEditError(null);

    const startIso = datetimeLocalToIso(editDraft.event_start_local);
    const endIso = datetimeLocalToIso(editDraft.event_end_local);
    if (startIso === "" || endIso === "") {
      setEditError("Invalid start or end date/time.");
      return;
    }

    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        workspace_id: workspaceId,
        project_id: editDraft.project_id,
        display_label: editDraft.display_label.trim(),
        event_start_at: startIso,
        event_end_at: endIso,
        zoom_meeting_id: editDraft.zoom_meeting_id.trim() === "" ? null : editDraft.zoom_meeting_id.trim(),
        zoom_source_type: editDraft.zoom_source_type === "" ? null : editDraft.zoom_source_type,
        is_active: editDraft.is_active,
        sort_order: editDraft.sort_order.trim() === "" ? null : Number.parseInt(editDraft.sort_order, 10),
      };

      if (body.sort_order !== null && !Number.isInteger(body.sort_order)) {
        setEditError("Sort order must be an integer or empty.");
        setEditSaving(false);
        return;
      }

      const res = await fetch(`/api/webinar-runs/${encodeURIComponent(editingId)}`, {
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
        (json as { success: unknown }).success === true
      ) {
        cancelEdit();
        void loadRuns();
      } else {
        setEditError("Unexpected response.");
      }
    } catch {
      setEditError("Network error.");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(run: WebinarRunRow): Promise<void> {
    setRowBusy(run.id);
    try {
      const res = await fetch(`/api/webinar-runs/${encodeURIComponent(run.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          is_active: !run.is_active,
        }),
      });
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true
      ) {
        void loadRuns();
      } else {
        setLoadError("Failed to update status.");
      }
    } catch {
      setLoadError("Network error.");
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteRun(id: string): Promise<void> {
    if (!window.confirm("Delete this webinar run permanently?")) return;
    setRowBusy(id);
    try {
      const res = await fetch(`/api/webinar-runs/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true
      ) {
        if (editingId === id) cancelEdit();
        void loadRuns();
      } else {
        setLoadError("Failed to delete run.");
      }
    } catch {
      setLoadError("Network error.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">All Webinar Runs</h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Loading…</p>
          ) : loadError !== null ? (
            <p className="p-6 text-sm text-red-600">{loadError}</p>
          ) : runs.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No webinar runs configured yet.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Label</th>
                  <th className="px-6 py-3 font-semibold">Project</th>
                  <th className="px-6 py-3 font-semibold">Dates</th>
                  <th className="px-6 py-3 font-semibold">Zoom ID</th>
                  <th className="px-6 py-3 font-semibold text-center">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {runs.map((run) =>
                  editingId === run.id && editDraft !== null ? (
                    <tr key={run.id} className="bg-indigo-50/50">
                      <td colSpan={6} className="p-6">
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                          <label className="block text-xs font-medium text-slate-700">
                            Project
                            <select
                              className="mt-1 w-full bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                              value={editDraft.project_id}
                              onChange={(e) => setEditDraft({ ...editDraft, project_id: e.target.value })}
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs font-medium text-slate-700">
                            Display Label
                            <input
                              className="mt-1 w-full bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                              value={editDraft.display_label}
                              onChange={(e) => setEditDraft({ ...editDraft, display_label: e.target.value })}
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-700">
                            Start Local
                            <input
                              type="datetime-local"
                              className="mt-1 w-full bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                              value={editDraft.event_start_local}
                              onChange={(e) => setEditDraft({ ...editDraft, event_start_local: e.target.value })}
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-700">
                            End Local
                            <input
                              type="datetime-local"
                              className="mt-1 w-full bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                              value={editDraft.event_end_local}
                              onChange={(e) => setEditDraft({ ...editDraft, event_end_local: e.target.value })}
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-700">
                            Zoom ID
                            <input
                              className="mt-1 w-full bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                              value={editDraft.zoom_meeting_id}
                              onChange={(e) => setEditDraft({ ...editDraft, zoom_meeting_id: e.target.value })}
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-700">
                            Zoom Type
                            <select
                              className="mt-1 w-full bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                              value={editDraft.zoom_source_type}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, zoom_source_type: e.target.value as "" | "meeting" | "webinar" })
                              }
                            >
                              <option value="">(none)</option>
                              <option value="meeting">meeting</option>
                              <option value="webinar">webinar</option>
                            </select>
                          </label>
                        </div>
                        {editError !== null && <p className="text-red-600 text-xs mt-3">{editError}</p>}
                        <div className="flex items-center gap-3 mt-4">
                          <button
                            type="button"
                            onClick={() => void saveEdit()}
                            disabled={editSaving}
                            className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            {editSaving ? "Saving…" : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={editSaving}
                            className="bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={run.id}
                      className={`hover:bg-slate-50 transition-colors ${rowBusy === run.id ? "opacity-50" : ""}`}
                    >
                      <td className="px-6 py-4 font-medium text-slate-900">{run.display_label}</td>
                      <td className="px-6 py-4">
                        {projects.find((p) => p.id === run.project_id)?.name ?? <span className="text-slate-400">Unknown</span>}
                      </td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap">
                        <div className="text-slate-900">{new Date(run.event_start_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</div>
                        <div className="text-slate-500">to {new Date(run.event_end_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{run.zoom_meeting_id ?? "—"}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => void toggleActive(run)}
                          className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider transition-colors ${
                            run.is_active
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                          }`}
                        >
                          {run.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(run)}
                          className="text-indigo-600 hover:text-indigo-900 font-medium text-xs mr-3 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRun(run.id)}
                          className="text-red-500 hover:text-red-700 font-medium text-xs transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Add Webinar Run</h2>
            <p className="text-xs text-slate-500 mt-1">Import from Zoom or create manually.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setZoomImportOpen(false); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                !zoomImportOpen
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={openZoomImport}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                zoomImportOpen
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Import from Zoom
            </button>
          </div>
        </div>

        {/* ── Project selector (shared between both modes) ── */}
        <div className="px-6 pt-5 pb-0">
          <label className="block text-slate-700 max-w-xs">
            <span className="font-medium mb-1 block text-xs uppercase tracking-wide text-slate-500">Project</span>
            <select
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={createDraft.project_id}
              onChange={(e) => {
                setCreateDraft((d) => ({ ...d, project_id: e.target.value }));
                if (zoomImportOpen && e.target.value !== "") {
                  void fetchZoomEvents(e.target.value);
                }
              }}
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Zoom Import Panel ── */}
        {zoomImportOpen && (
          <div className="p-6">
            {createDraft.project_id === "" ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg p-4 border border-slate-200">
                <AlertCircle size={16} className="shrink-0" />
                Select a project above to browse its Zoom webinars and meetings.
              </div>
            ) : zoomEventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                <RefreshCw size={16} className="animate-spin" />
                Fetching from Zoom…
              </div>
            ) : zoomEventsError !== null ? (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Could not load Zoom events</p>
                  <p className="text-xs mt-1">{zoomEventsError}</p>
                </div>
              </div>
            ) : zoomEvents.length === 0 ? (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-6 text-center border border-slate-200">
                No webinars or meetings found in this project&apos;s Zoom account.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Select all / count */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    {selectedZoomIds.size === zoomEvents.length ? (
                      <CheckSquare size={14} className="text-indigo-600" />
                    ) : (
                      <Square size={14} />
                    )}
                    {selectedZoomIds.size === zoomEvents.length ? "Deselect all" : "Select all"}
                  </button>
                  <span className="text-xs text-slate-400">{zoomEvents.length} events found</span>
                </div>

                {/* Event list */}
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden max-h-96 overflow-y-auto">
                  {zoomEvents.map((event) => {
                    const isSelected = selectedZoomIds.has(event.zoom_id);
                    const isPast = Date.parse(event.start_time) < Date.now();
                    return (
                      <label
                        key={event.zoom_id}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 shrink-0"
                          checked={isSelected}
                          onChange={() => toggleZoomEvent(event.zoom_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{event.topic}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatEventDate(event.start_time)}
                            {event.duration_minutes > 0 && (
                              <span className="ml-1">· {event.duration_minutes} min</span>
                            )}
                            {" · "}
                            <span className="font-mono text-slate-400">{event.zoom_id}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                              event.zoom_source_type === "webinar"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {event.zoom_source_type}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                              isPast
                                ? "bg-slate-100 text-slate-500"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isPast ? "past" : "upcoming"}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Import result feedback */}
                {importResult !== null && (
                  <div className={`text-sm rounded-lg px-4 py-3 flex items-center gap-2 ${
                    importResult.failed === 0
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}>
                    {importResult.ok > 0 && (
                      <span>{importResult.ok} run{importResult.ok !== 1 ? "s" : ""} created.</span>
                    )}
                    {importResult.failed > 0 && (
                      <span className="ml-1">{importResult.failed} failed (may already exist or project has no GHL location).</span>
                    )}
                  </div>
                )}

                {/* Action button */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => void fetchZoomEvents(createDraft.project_id)}
                    className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                  >
                    <RefreshCw size={12} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    disabled={selectedZoomIds.size === 0 || importing}
                    onClick={() => void handleImportSelected()}
                    className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {importing
                      ? "Creating…"
                      : `Create ${selectedZoomIds.size > 0 ? selectedZoomIds.size : ""} Run${selectedZoomIds.size !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Manual Create Form ── */}
        {!zoomImportOpen && (
        <div className="p-6 text-sm">
          <form className="grid gap-4 sm:grid-cols-2 md:grid-cols-3" onSubmit={(e) => void handleCreate(e)}>
            <label className="block text-slate-700">
              <span className="font-medium mb-1 block text-xs uppercase tracking-wide text-slate-500">Display label</span>
              <input
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={createDraft.display_label}
                onChange={(e) => setCreateDraft((d) => ({ ...d, display_label: e.target.value }))}
                required
              />
            </label>
            <label className="block text-slate-700 border-t border-slate-100 pt-4 sm:border-0 sm:pt-0">
              <span className="font-medium mb-1 block text-xs uppercase tracking-wide text-slate-500">Event Start</span>
              <input
                type="datetime-local"
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={createDraft.event_start_local}
                onChange={(e) => setCreateDraft((d) => ({ ...d, event_start_local: e.target.value }))}
                required
              />
            </label>
            <label className="block text-slate-700">
              <span className="font-medium mb-1 block text-xs uppercase tracking-wide text-slate-500">Event End</span>
              <input
                type="datetime-local"
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={createDraft.event_end_local}
                onChange={(e) => setCreateDraft((d) => ({ ...d, event_end_local: e.target.value }))}
                required
              />
            </label>
            <label className="block text-slate-700">
              <span className="font-medium mb-1 block text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">Zoom Meeting ID <AlertCircle size={12} className="text-slate-400"/></span>
              <input
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={createDraft.zoom_meeting_id}
                onChange={(e) => setCreateDraft((d) => ({ ...d, zoom_meeting_id: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="block text-slate-700">
              <span className="font-medium mb-1 block text-xs uppercase tracking-wide text-slate-500">Zoom Source Type</span>
              <select
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={createDraft.zoom_source_type}
                onChange={(e) => setCreateDraft((d) => ({ ...d, zoom_source_type: e.target.value as "" | "meeting" | "webinar" }))}
              >
                <option value="">(none)</option>
                <option value="meeting">Meeting</option>
                <option value="webinar">Webinar</option>
              </select>
            </label>

            <div className="sm:col-span-2 md:col-span-3 border-t border-slate-100 pt-4 mt-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 mb-4">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  checked={createDraft.is_active}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, is_active: e.target.checked }))}
                />
                Active (available in dashboard dropdowns)
              </label>

              {createError !== null && <p className="text-red-700 text-sm mb-3">{createError}</p>}
              {createOk !== null && <p className="text-emerald-700 text-sm mb-3">{createOk}</p>}

              <button
                type="submit"
                disabled={creating}
                className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Webinar Run"}
              </button>
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}

function IntegrationsContent() {
  return (
    <div className="flex bg-slate-50 min-h-[calc(100vh-56px)]">
      <SettingsSidebar />
      <div className="flex-1 p-8 max-w-6xl">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">
          Webinar Runs
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          Manage all webinar runs across projects. Zoom credentials are configured per-project under each
          project&apos;s <strong>Zoom</strong> tab.
        </p>
        <WebinarRunsTab />
      </div>
    </div>
  );
}

export default function IntegrationsPage(): React.ReactElement {
  useEffect(() => {
    document.title = "Integrations — NM Media";
  }, []);

  return (
    <SettingsShell>
      <IntegrationsContent />
    </SettingsShell>
  );
}
