"use client";



import Link from "next/link";

import { useCallback, useEffect, useState } from "react";

import { getAuthHeaders } from "@/lib/settings-api";



type WebinarRunRow = {

  id: string;

  project_id: string | null;

  display_label: string;

  event_start_at: string;

  event_end_at: string;

  format: string;

  location_id: string;

  timezone: string;

  zoom_meeting_id: string | null;

  zoom_source_type: string | null;

  is_active: boolean;

  sort_order: number | null;

};



type ProjectOption = {

  id: string;

  name: string;

};



function isoToDatetimeLocal(iso: string): string {

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {

    return "";

  }

  const pad = (n: number): string => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

}



function datetimeLocalToIso(local: string): string {

  const ms = Date.parse(local);

  if (Number.isNaN(ms)) {

    return "";

  }

  return new Date(ms).toISOString();

}



function formatEventStart(iso: string): string {

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {

    return iso;

  }

  return d.toLocaleString(undefined, {

    dateStyle: "medium",

    timeStyle: "short",

  });

}



type DraftFields = {

  project_id: string;

  display_label: string;

  event_start_local: string;

  event_end_local: string;

  format: string;

  location_id: string;

  timezone: string;

  zoom_meeting_id: string;

  zoom_source_type: "" | "meeting" | "webinar";

  is_active: boolean;

  sort_order: string;

};



function runToDraft(run: WebinarRunRow): DraftFields {

  return {

    project_id: run.project_id ?? "",

    display_label: run.display_label,

    event_start_local: isoToDatetimeLocal(run.event_start_at),

    event_end_local: isoToDatetimeLocal(run.event_end_at),

    format: run.format,

    location_id: run.location_id,

    timezone: run.timezone,

    zoom_meeting_id: run.zoom_meeting_id ?? "",

    zoom_source_type:

      run.zoom_source_type === "meeting" || run.zoom_source_type === "webinar"

        ? run.zoom_source_type

        : "",

    is_active: run.is_active,

    sort_order: run.sort_order === null ? "" : String(run.sort_order),

  };

}



/**

 * List, create, edit, activate/deactivate, and delete webinar runs.

 */

export default function WebinarRunsSettingsPage(): React.ReactElement {

  const [runs, setRuns] = useState<WebinarRunRow[]>([]);

  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);



  const [createDraft, setCreateDraft] = useState<DraftFields>({

    project_id: "",

    display_label: "",

    event_start_local: "",

    event_end_local: "",

    format: "",

    location_id: "",

    timezone: "",

    zoom_meeting_id: "",

    zoom_source_type: "",

    is_active: true,

    sort_order: "",

  });

  const [createError, setCreateError] = useState<string | null>(null);

  const [createOk, setCreateOk] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);



  const [editingId, setEditingId] = useState<string | null>(null);

  const [editDraft, setEditDraft] = useState<DraftFields | null>(null);

  const [editError, setEditError] = useState<string | null>(null);

  const [editSaving, setEditSaving] = useState(false);



  const [rowBusy, setRowBusy] = useState<string | null>(null);



  const loadRuns = useCallback(async (): Promise<void> => {

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setLoadError("Missing auth_token or workspace_id in localStorage.");

      setLoading(false);

      return;

    }

    setLoading(true);

    setLoadError(null);

    try {

      const [runsRes, projRes] = await Promise.all([

        fetch(`/api/webinar-runs?workspace_id=${encodeURIComponent(ws)}`, {

          headers,

        }),

        fetch(`/api/projects?workspace_id=${encodeURIComponent(ws)}`, {

          headers,

        }),

      ]);

      const runsJson: unknown = await runsRes.json();

      if (

        typeof runsJson === "object" &&

        runsJson !== null &&

        "success" in runsJson &&

        runsJson.success === true &&

        "data" in runsJson &&

        Array.isArray((runsJson as { data: unknown }).data)

      ) {

        setRuns((runsJson as { data: WebinarRunRow[] }).data);

      } else if (

        typeof runsJson === "object" &&

        runsJson !== null &&

        "error" in runsJson &&

        typeof (runsJson as { error: unknown }).error === "string"

      ) {

        setLoadError((runsJson as { error: string }).error);

      } else {

        setLoadError("Unexpected response loading webinar runs.");

      }



      const projJson: unknown = await projRes.json();

      if (

        typeof projJson === "object" &&

        projJson !== null &&

        "success" in projJson &&

        projJson.success === true &&

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

  }, []);



  useEffect(() => {

    void loadRuns();

  }, [loadRuns]);



  async function handleCreate(e: React.FormEvent<HTMLFormElement>): Promise<void> {

    e.preventDefault();

    setCreateError(null);

    setCreateOk(null);

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setCreateError("Missing auth_token or workspace_id.");

      return;

    }

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

        workspace_id: ws,

        project_id: createDraft.project_id,

        display_label: createDraft.display_label.trim(),

        event_start_at: startIso,

        event_end_at: endIso,

        format: createDraft.format.trim(),

        location_id: createDraft.location_id.trim(),

        timezone: createDraft.timezone.trim(),

        is_active: createDraft.is_active,

      };

      if (createDraft.zoom_meeting_id.trim() !== "") {

        body.zoom_meeting_id = createDraft.zoom_meeting_id.trim();

      } else {

        body.zoom_meeting_id = null;

      }

      if (createDraft.zoom_source_type === "") {

        body.zoom_source_type = null;

      } else {

        body.zoom_source_type = createDraft.zoom_source_type;

      }

      if (createDraft.sort_order.trim() !== "") {

        const n = Number.parseInt(createDraft.sort_order, 10);

        if (!Number.isInteger(n)) {

          setCreateError("Sort order must be an integer or empty.");

          setCreating(false);

          return;

        }

        body.sort_order = n;

      } else {

        body.sort_order = null;

      }



      const res = await fetch("/api/webinar-runs", {

        method: "POST",

        headers: { ...headers, "Content-Type": "application/json" },

        body: JSON.stringify(body),

      });

      const json: unknown = await res.json();

      if (

        typeof json === "object" &&

        json !== null &&

        "success" in json &&

        json.success === true

      ) {

        setCreateOk("Webinar run created.");

        setCreateDraft({

          project_id: "",

          display_label: "",

          event_start_local: "",

          event_end_local: "",

          format: "",

          location_id: "",

          timezone: "",

          zoom_meeting_id: "",

          zoom_source_type: "",

          is_active: true,

          sort_order: "",

        });

        void loadRuns();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setCreateError((json as { error: string }).error);

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

    if (editingId === null || editDraft === null) {

      return;

    }

    setEditError(null);

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setEditError("Missing auth_token or workspace_id.");

      return;

    }

    const startIso = datetimeLocalToIso(editDraft.event_start_local);

    const endIso = datetimeLocalToIso(editDraft.event_end_local);

    if (startIso === "" || endIso === "") {

      setEditError("Invalid start or end date/time.");

      return;

    }

    setEditSaving(true);

    try {

      const body: Record<string, unknown> = {

        workspace_id: ws,

        project_id: editDraft.project_id,

        display_label: editDraft.display_label.trim(),

        event_start_at: startIso,

        event_end_at: endIso,

        format: editDraft.format.trim(),

        location_id: editDraft.location_id.trim(),

        timezone: editDraft.timezone.trim(),

        is_active: editDraft.is_active,

      };

      if (editDraft.zoom_meeting_id.trim() !== "") {

        body.zoom_meeting_id = editDraft.zoom_meeting_id.trim();

      } else {

        body.zoom_meeting_id = null;

      }

      if (editDraft.zoom_source_type === "") {

        body.zoom_source_type = null;

      } else {

        body.zoom_source_type = editDraft.zoom_source_type;

      }

      if (editDraft.sort_order.trim() !== "") {

        const n = Number.parseInt(editDraft.sort_order, 10);

        if (!Number.isInteger(n)) {

          setEditError("Sort order must be an integer or empty.");

          setEditSaving(false);

          return;

        }

        body.sort_order = n;

      } else {

        body.sort_order = null;

      }



      const res = await fetch(`/api/webinar-runs/${encodeURIComponent(editingId)}`, {

        method: "PATCH",

        headers: { ...headers, "Content-Type": "application/json" },

        body: JSON.stringify(body),

      });

      const json: unknown = await res.json();

      if (

        typeof json === "object" &&

        json !== null &&

        "success" in json &&

        json.success === true

      ) {

        cancelEdit();

        void loadRuns();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setEditError((json as { error: string }).error);

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

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setLoadError("Missing auth_token or workspace_id.");

      return;

    }

    setRowBusy(run.id);

    try {

      const res = await fetch(`/api/webinar-runs/${encodeURIComponent(run.id)}`, {

        method: "PATCH",

        headers: { ...headers, "Content-Type": "application/json" },

        body: JSON.stringify({

          workspace_id: ws,

          is_active: !run.is_active,

        }),

      });

      const json: unknown = await res.json();

      if (

        typeof json === "object" &&

        json !== null &&

        "success" in json &&

        json.success === true

      ) {

        void loadRuns();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setLoadError((json as { error: string }).error);

      }

    } catch {

      setLoadError("Network error.");

    } finally {

      setRowBusy(null);

    }

  }



  async function deleteRun(id: string): Promise<void> {

    if (!window.confirm("Delete this webinar run permanently?")) {

      return;

    }

    const headers = getAuthHeaders();

    if (Object.keys(headers).length === 0) {

      setLoadError("Missing auth_token or workspace_id.");

      return;

    }

    setRowBusy(id);

    try {

      const res = await fetch(`/api/webinar-runs/${encodeURIComponent(id)}`, {

        method: "DELETE",

        headers,

      });

      const json: unknown = await res.json();

      if (

        typeof json === "object" &&

        json !== null &&

        "success" in json &&

        json.success === true

      ) {

        if (editingId === id) {

          cancelEdit();

        }

        void loadRuns();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setLoadError((json as { error: string }).error);

      }

    } catch {

      setLoadError("Network error.");

    } finally {

      setRowBusy(null);

    }

  }



  return (

    <div className="mx-auto max-w-6xl space-y-8 p-6">

      <div className="flex items-center justify-between gap-4">

        <div>

          <h1 className="text-xl font-semibold text-slate-900">Webinar runs</h1>

          <p className="mt-1 text-sm text-slate-600">

            Create and manage webinar runs for projects in this workspace.

          </p>

        </div>

        <Link

          href="/settings"

          className="text-sm font-medium text-slate-600 hover:text-slate-900"

        >

          ← Settings

        </Link>

      </div>



      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">

        <h2 className="mb-3 text-sm font-semibold text-slate-800">Create run</h2>

        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void handleCreate(e)}>

          <label className="block text-sm text-slate-700 sm:col-span-2">

            Project

            <select

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.project_id}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, project_id: e.target.value }))

              }

              required

            >

              <option value="">Select project…</option>

              {projects.map((p) => (

                <option key={p.id} value={p.id}>

                  {p.name}

                </option>

              ))}

            </select>

          </label>

          <label className="block text-sm text-slate-700">

            Display label

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.display_label}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, display_label: e.target.value }))

              }

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Format

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.format}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, format: e.target.value }))

              }

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Event start

            <input

              type="datetime-local"

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.event_start_local}

              onChange={(e) =>

                setCreateDraft((d) => ({

                  ...d,

                  event_start_local: e.target.value,

                }))

              }

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Event end

            <input

              type="datetime-local"

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.event_end_local}

              onChange={(e) =>

                setCreateDraft((d) => ({

                  ...d,

                  event_end_local: e.target.value,

                }))

              }

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Location ID (GHL)

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.location_id}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, location_id: e.target.value }))

              }

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Timezone

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.timezone}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, timezone: e.target.value }))

              }

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Zoom meeting ID (optional)

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.zoom_meeting_id}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, zoom_meeting_id: e.target.value }))

              }

            />

          </label>

          <label className="block text-sm text-slate-700">

            Zoom source type

            <select

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.zoom_source_type}

              onChange={(e) =>

                setCreateDraft((d) => ({

                  ...d,

                  zoom_source_type: e.target.value as "" | "meeting" | "webinar",

                }))

              }

            >

              <option value="">(none)</option>

              <option value="meeting">meeting</option>

              <option value="webinar">webinar</option>

            </select>

          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">

            <input

              type="checkbox"

              checked={createDraft.is_active}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, is_active: e.target.checked }))

              }

            />

            Active

          </label>

          <label className="block text-sm text-slate-700">

            Sort order (optional)

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={createDraft.sort_order}

              onChange={(e) =>

                setCreateDraft((d) => ({ ...d, sort_order: e.target.value }))

              }

            />

          </label>

          {createError !== null ? (

            <p className="text-sm text-red-700 sm:col-span-2">{createError}</p>

          ) : null}

          {createOk !== null ? (

            <p className="text-sm text-green-800 sm:col-span-2">{createOk}</p>

          ) : null}

          <div className="sm:col-span-2">

            <button

              type="submit"

              disabled={creating}

              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"

            >

              {creating ? "Creating…" : "Create webinar run"}

            </button>

          </div>

        </form>

      </section>



      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">

        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">

          All runs

        </h2>

        {loading ? (

          <p className="p-4 text-sm text-slate-600">Loading…</p>

        ) : loadError !== null ? (

          <p className="p-4 text-sm text-red-700">{loadError}</p>

        ) : (

          <table className="min-w-full border-collapse text-left text-sm">

            <thead>

              <tr className="border-b border-slate-200 bg-slate-50">

                <th className="px-3 py-2 font-medium text-slate-700">Label</th>

                <th className="px-3 py-2 font-medium text-slate-700">Start</th>

                <th className="px-3 py-2 font-medium text-slate-700">Format</th>

                <th className="px-3 py-2 font-medium text-slate-700">Location</th>

                <th className="px-3 py-2 font-medium text-slate-700">Zoom ID</th>

                <th className="px-3 py-2 font-medium text-slate-700">Zoom type</th>

                <th className="px-3 py-2 font-medium text-slate-700">Active</th>

                <th className="px-3 py-2 font-medium text-slate-700">Actions</th>

              </tr>

            </thead>

            <tbody>

              {runs.map((run) =>

                editingId === run.id && editDraft !== null ? (

                  <tr key={run.id} className="border-b border-slate-100 bg-amber-50/50">

                    <td colSpan={8} className="p-4">

                      <div className="grid gap-3 sm:grid-cols-2">

                        <label className="block text-xs text-slate-700 sm:col-span-2">

                          Project

                          <select

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.project_id}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, project_id: e.target.value }

                              )

                            }

                          >

                            {projects.map((p) => (

                              <option key={p.id} value={p.id}>

                                {p.name}

                              </option>

                            ))}

                          </select>

                        </label>

                        <label className="block text-xs text-slate-700">

                          Display label

                          <input

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.display_label}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, display_label: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Format

                          <input

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.format}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null ? d : { ...d, format: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Event start

                          <input

                            type="datetime-local"

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.event_start_local}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, event_start_local: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Event end

                          <input

                            type="datetime-local"

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.event_end_local}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, event_end_local: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Location ID

                          <input

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.location_id}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, location_id: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Timezone

                          <input

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.timezone}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, timezone: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Zoom meeting ID

                          <input

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.zoom_meeting_id}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, zoom_meeting_id: e.target.value }

                              )

                            }

                          />

                        </label>

                        <label className="block text-xs text-slate-700">

                          Zoom source

                          <select

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.zoom_source_type}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : {

                                      ...d,

                                      zoom_source_type: e.target

                                        .value as DraftFields["zoom_source_type"],

                                    }

                              )

                            }

                          >

                            <option value="">(none)</option>

                            <option value="meeting">meeting</option>

                            <option value="webinar">webinar</option>

                          </select>

                        </label>

                        <label className="flex items-center gap-2 text-xs text-slate-700">

                          <input

                            type="checkbox"

                            checked={editDraft.is_active}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, is_active: e.target.checked }

                              )

                            }

                          />

                          Active

                        </label>

                        <label className="block text-xs text-slate-700">

                          Sort order

                          <input

                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                            value={editDraft.sort_order}

                            onChange={(e) =>

                              setEditDraft((d) =>

                                d === null

                                  ? d

                                  : { ...d, sort_order: e.target.value }

                              )

                            }

                          />

                        </label>

                        {editError !== null ? (

                          <p className="text-sm text-red-700 sm:col-span-2">

                            {editError}

                          </p>

                        ) : null}

                        <div className="flex flex-wrap gap-2 sm:col-span-2">

                          <button

                            type="button"

                            onClick={() => void saveEdit()}

                            disabled={editSaving}

                            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"

                          >

                            {editSaving ? "Saving…" : "Save"}

                          </button>

                          <button

                            type="button"

                            onClick={cancelEdit}

                            className="rounded border border-slate-300 px-3 py-1.5 text-sm"

                          >

                            Cancel

                          </button>

                        </div>

                      </div>

                    </td>

                  </tr>

                ) : (

                  <tr key={run.id} className="border-b border-slate-100">

                    <td className="px-3 py-2">{run.display_label}</td>

                    <td className="px-3 py-2 whitespace-nowrap">

                      {formatEventStart(run.event_start_at)}

                    </td>

                    <td className="px-3 py-2">{run.format}</td>

                    <td className="px-3 py-2 font-mono text-xs">{run.location_id}</td>

                    <td className="px-3 py-2 font-mono text-xs">

                      {run.zoom_meeting_id ?? "—"}

                    </td>

                    <td className="px-3 py-2">{run.zoom_source_type ?? "—"}</td>

                    <td className="px-3 py-2">{run.is_active ? "yes" : "no"}</td>

                    <td className="px-3 py-2">

                      <div className="flex flex-wrap gap-1">

                        <button

                          type="button"

                          onClick={() => startEdit(run)}

                          disabled={rowBusy === run.id}

                          className="rounded border border-slate-300 px-2 py-1 text-xs"

                        >

                          Edit

                        </button>

                        <button

                          type="button"

                          onClick={() => void toggleActive(run)}

                          disabled={rowBusy === run.id}

                          className="rounded border border-slate-300 px-2 py-1 text-xs"

                        >

                          {run.is_active ? "Deactivate" : "Activate"}

                        </button>

                        <button

                          type="button"

                          onClick={() => void deleteRun(run.id)}

                          disabled={rowBusy === run.id}

                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-800"

                        >

                          Delete

                        </button>

                      </div>

                    </td>

                  </tr>

                )

              )}

            </tbody>

          </table>

        )}

        {!loading && runs.length === 0 && loadError === null ? (

          <p className="p-4 text-sm text-slate-600">No webinar runs yet.</p>

        ) : null}

      </section>

    </div>

  );

}


