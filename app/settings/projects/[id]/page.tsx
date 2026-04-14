"use client";



import Link from "next/link";

import { useParams } from "next/navigation";

import { useCallback, useEffect, useState } from "react";

import type { Json } from "@/database.types";

import { getAuthHeaders } from "@/lib/settings-api";



type ProjectRow = {

  id: string;

  name: string;

  description: string | null;

  ghl_location_id: string | null;

  zoom_integration_account_id: string | null;

  traffic_occupation_field_id: string | null;

  traffic_occupation_field_key: string | null;

  traffic_agency_line_tags: Json | null;

};



type ZoomAccountRow = {

  id: string;

  display_name: string;

  provider: string;

};



type GhlConnectionRow = {

  id: string;

  project_id: string;

  ghl_location_id: string;

  is_active: boolean;

  created_at: string;

  updated_at: string;

};



/**

 * Edit a single project: traffic fields, Zoom account, and GHL connections.

 */

export default function ProjectSettingsPage(): React.ReactElement {

  const params = useParams();

  const projectId = typeof params.id === "string" ? params.id : "";



  const [project, setProject] = useState<ProjectRow | null>(null);

  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccountRow[]>([]);

  const [ghlConnections, setGhlConnections] = useState<GhlConnectionRow[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);



  const [name, setName] = useState("");

  const [description, setDescription] = useState("");

  const [ghlLocationId, setGhlLocationId] = useState("");

  const [zoomAccountId, setZoomAccountId] = useState("");

  const [occupationFieldId, setOccupationFieldId] = useState("");

  const [occupationFieldKey, setOccupationFieldKey] = useState("");

  const [agencyTagsText, setAgencyTagsText] = useState("{}");



  const [saveError, setSaveError] = useState<string | null>(null);

  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);



  const [ghlFormLocation, setGhlFormLocation] = useState("");

  const [ghlFormToken, setGhlFormToken] = useState("");

  const [ghlError, setGhlError] = useState<string | null>(null);

  const [ghlOk, setGhlOk] = useState<string | null>(null);

  const [ghlSaving, setGhlSaving] = useState(false);



  const loadAll = useCallback(async (): Promise<void> => {

    if (projectId === "") {

      setLoadError("Invalid project id.");

      setLoading(false);

      return;

    }

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

      const [projRes, intRes, ghlRes] = await Promise.all([

        fetch(`/api/projects/${encodeURIComponent(projectId)}`, { headers }),

        fetch(

          `/api/integrations/accounts?workspace_id=${encodeURIComponent(ws)}&provider=zoom`,

          { headers }

        ),

        fetch(

          `/api/projects/${encodeURIComponent(projectId)}/connections/ghl`,

          { headers }

        ),

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

        setZoomAccountId(p.zoom_integration_account_id ?? "");

        setOccupationFieldId(p.traffic_occupation_field_id ?? "");

        setOccupationFieldKey(p.traffic_occupation_field_key ?? "");

        setAgencyTagsText(

          p.traffic_agency_line_tags === null

            ? "{}"

            : JSON.stringify(p.traffic_agency_line_tags, null, 2)

        );

      } else if (

        typeof projJson === "object" &&

        projJson !== null &&

        "error" in projJson &&

        typeof (projJson as { error: unknown }).error === "string"

      ) {

        setLoadError((projJson as { error: string }).error);

        setLoading(false);

        return;

      } else {

        setLoadError("Failed to load project.");

        setLoading(false);

        return;

      }



      const intJson: unknown = await intRes.json();

      if (

        typeof intJson === "object" &&

        intJson !== null &&

        "success" in intJson &&

        intJson.success === true &&

        "data" in intJson &&

        Array.isArray((intJson as { data: unknown }).data)

      ) {

        setZoomAccounts((intJson as { data: ZoomAccountRow[] }).data);

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

    } catch {

      setLoadError("Network error loading project.");

    } finally {

      setLoading(false);

    }

  }, [projectId]);



  useEffect(() => {

    void loadAll();

  }, [loadAll]);



  async function handleSaveProject(e: React.FormEvent<HTMLFormElement>): Promise<void> {

    e.preventDefault();

    setSaveError(null);

    setSaveOk(null);

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setSaveError("Missing auth_token or workspace_id.");

      return;

    }

    let parsedTags: Json;

    try {

      const raw = JSON.parse(agencyTagsText) as unknown;

      if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {

        setSaveError("Agency line tags must be a JSON object or null.");

        return;

      }

      parsedTags = raw as Json;

    } catch {

      setSaveError("Agency line tags: invalid JSON.");

      return;

    }

    setSaving(true);

    try {

      const body: Record<string, unknown> = {

        workspace_id: ws,

        name: name.trim(),

        description: description.trim() === "" ? null : description.trim(),

        ghl_location_id: ghlLocationId.trim() === "" ? null : ghlLocationId.trim(),

        zoom_integration_account_id:

          zoomAccountId === "" ? null : zoomAccountId,

        traffic_occupation_field_id:

          occupationFieldId.trim() === "" ? null : occupationFieldId.trim(),

        traffic_occupation_field_key:

          occupationFieldKey.trim() === "" ? null : occupationFieldKey.trim(),

        traffic_agency_line_tags: parsedTags,

      };

      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {

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

        setSaveOk("Project saved.");

        void loadAll();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setSaveError((json as { error: string }).error);

      } else {

        setSaveError("Unexpected response.");

      }

    } catch {

      setSaveError("Network error.");

    } finally {

      setSaving(false);

    }

  }



  async function handleAddGhl(e: React.FormEvent<HTMLFormElement>): Promise<void> {

    e.preventDefault();

    setGhlError(null);

    setGhlOk(null);

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setGhlError("Missing auth_token or workspace_id.");

      return;

    }

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

          headers: { ...headers, "Content-Type": "application/json" },

          body: JSON.stringify({

            workspace_id: ws,

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

        json.success === true

      ) {

        setGhlOk("GHL connection created.");

        setGhlFormToken("");

        setGhlFormLocation("");

        void loadAll();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setGhlError((json as { error: string }).error);

      } else {

        setGhlError("Unexpected response.");

      }

    } catch {

      setGhlError("Network error.");

    } finally {

      setGhlSaving(false);

    }

  }



  return (

    <div className="mx-auto max-w-3xl space-y-8 p-6">

      <div className="flex items-center justify-between gap-4">

        <div>

          <h1 className="text-xl font-semibold text-slate-900">Project settings</h1>

          {project !== null ? (

            <p className="mt-1 font-mono text-xs text-slate-500">{project.id}</p>

          ) : null}

        </div>

        <Link

          href="/settings"

          className="text-sm font-medium text-slate-600 hover:text-slate-900"

        >

          ← Settings

        </Link>

      </div>



      {loading ? (

        <p className="text-sm text-slate-600">Loading…</p>

      ) : loadError !== null ? (

        <p className="text-sm text-red-700">{loadError}</p>

      ) : (

        <>

          <form

            className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"

            onSubmit={(e) => void handleSaveProject(e)}

          >

            <h2 className="text-sm font-semibold text-slate-800">Project</h2>

            <label className="block text-sm text-slate-700">

              Name

              <input

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                value={name}

                onChange={(e) => setName(e.target.value)}

                required

              />

            </label>

            <label className="block text-sm text-slate-700">

              Description (optional)

              <textarea

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                rows={3}

                value={description}

                onChange={(e) => setDescription(e.target.value)}

              />

            </label>

            <label className="block text-sm text-slate-700">

              GHL location ID

              <input

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                value={ghlLocationId}

                onChange={(e) => setGhlLocationId(e.target.value)}

                placeholder="Sub-account location ID"

              />

            </label>

            <label className="block text-sm text-slate-700">

              Zoom integration account

              <select

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                value={zoomAccountId}

                onChange={(e) => setZoomAccountId(e.target.value)}

              >

                <option value="">None</option>

                {zoomAccounts.map((z) => (

                  <option key={z.id} value={z.id}>

                    {z.display_name}

                  </option>

                ))}

              </select>

            </label>

            <label className="block text-sm text-slate-700">

              Traffic occupation field ID

              <input

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                value={occupationFieldId}

                onChange={(e) => setOccupationFieldId(e.target.value)}

              />

            </label>

            <label className="block text-sm text-slate-700">

              Traffic occupation field key

              <input

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                value={occupationFieldKey}

                onChange={(e) => setOccupationFieldKey(e.target.value)}

              />

            </label>

            <label className="block text-sm text-slate-700">

              Traffic agency line tags (JSON object)

              <textarea

                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"

                rows={8}

                value={agencyTagsText}

                onChange={(e) => setAgencyTagsText(e.target.value)}

              />

            </label>

            {saveError !== null ? (

              <p className="text-sm text-red-700">{saveError}</p>

            ) : null}

            {saveOk !== null ? (

              <p className="text-sm text-green-800">{saveOk}</p>

            ) : null}

            <button

              type="submit"

              disabled={saving}

              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"

            >

              {saving ? "Saving…" : "Save project"}

            </button>

          </form>



          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">

            <h2 className="mb-3 text-sm font-semibold text-slate-800">

              GHL connections

            </h2>

            {ghlConnections.length === 0 ? (

              <p className="mb-4 text-sm text-slate-600">No GHL connections yet.</p>

            ) : (

              <ul className="mb-4 divide-y divide-slate-200 text-sm">

                {ghlConnections.map((c) => (

                  <li key={c.id} className="py-2">

                    <span className="font-medium text-slate-800">

                      {c.ghl_location_id}

                    </span>

                    <span className="ml-2 text-slate-600">

                      {c.is_active ? "active" : "inactive"} ·{" "}

                      {new Date(c.created_at).toLocaleString()}

                    </span>

                  </li>

                ))}

              </ul>

            )}

            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">

              Add connection

            </h3>

            <form className="space-y-3" onSubmit={(e) => void handleAddGhl(e)}>

              <label className="block text-sm text-slate-700">

                GHL location ID

                <input

                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                  value={ghlFormLocation}

                  onChange={(e) => setGhlFormLocation(e.target.value)}

                />

              </label>

              <label className="block text-sm text-slate-700">

                Private integration token

                <input

                  type="password"

                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

                  value={ghlFormToken}

                  onChange={(e) => setGhlFormToken(e.target.value)}

                  autoComplete="off"

                />

              </label>

              {ghlError !== null ? (

                <p className="text-sm text-red-700">{ghlError}</p>

              ) : null}

              {ghlOk !== null ? (

                <p className="text-sm text-green-800">{ghlOk}</p>

              ) : null}

              <button

                type="submit"

                disabled={ghlSaving}

                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50"

              >

                {ghlSaving ? "Saving…" : "Add GHL connection"}

              </button>

            </form>

          </section>

        </>

      )}

    </div>

  );

}


