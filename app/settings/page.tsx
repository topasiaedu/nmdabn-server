"use client";



import Link from "next/link";

import { useEffect, useState } from "react";

import { getAuthHeaders } from "@/lib/settings-api";



type ProjectRow = {

  id: string;

  name: string;

};



/**

 * Settings home: links to Zoom, webinar runs, and per-project settings.

 */

export default function SettingsIndexPage(): React.ReactElement {

  const [projects, setProjects] = useState<ProjectRow[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);



  useEffect(() => {

    let cancelled = false;

    async function load(): Promise<void> {

      const headers = getAuthHeaders();

      const ws = window.localStorage.getItem("workspace_id");

      if (

        Object.keys(headers).length === 0 ||

        ws === null ||

        ws === ""

      ) {

        setLoadError("Missing auth_token or workspace_id in localStorage.");

        setLoading(false);

        return;

      }

      try {

        const res = await fetch(

          `/api/projects?workspace_id=${encodeURIComponent(ws)}`,

          { headers }

        );

        const json: unknown = await res.json();

        if (

          typeof json === "object" &&

          json !== null &&

          "success" in json &&

          json.success === true &&

          "data" in json &&

          Array.isArray((json as { data: unknown }).data)

        ) {

          const rows = (json as { data: ProjectRow[] }).data;

          if (!cancelled) {

            setProjects(rows);

          }

        } else if (

          typeof json === "object" &&

          json !== null &&

          "error" in json &&

          typeof (json as { error: unknown }).error === "string"

        ) {

          if (!cancelled) {

            setLoadError((json as { error: string }).error);

          }

        } else {

          if (!cancelled) {

            setLoadError("Unexpected response when loading projects.");

          }

        }

      } catch {

        if (!cancelled) {

          setLoadError("Network error loading projects.");

        }

      } finally {

        if (!cancelled) {

          setLoading(false);

        }

      }

    }

    void load();

    return () => {

      cancelled = true;

    };

  }, []);



  return (

    <div className="mx-auto max-w-2xl space-y-8 p-6">

      <header>

        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

        <p className="mt-1 text-sm text-slate-600">

          Internal operator tools for workspace configuration.

        </p>

      </header>



      <nav className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">

        <Link

          href="/settings/zoom"

          className="block rounded-md px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"

        >

          Zoom Credentials

        </Link>

        <Link

          href="/settings/webinar-runs"

          className="block rounded-md px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"

        >

          Webinar Runs

        </Link>

      </nav>



      <section>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">

          Projects

        </h2>

        {loading ? (

          <p className="text-sm text-slate-600">Loading projects…</p>

        ) : loadError !== null ? (

          <p className="text-sm text-red-700">{loadError}</p>

        ) : projects.length === 0 ? (

          <p className="text-sm text-slate-600">No projects in this workspace.</p>

        ) : (

          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">

            {projects.map((p) => (

              <li key={p.id}>

                <Link

                  href={`/settings/projects/${p.id}`}

                  className="block px-4 py-3 text-sm text-slate-800 hover:bg-slate-50"

                >

                  {p.name}

                </Link>

              </li>

            ))}

          </ul>

        )}

      </section>

    </div>

  );

}


