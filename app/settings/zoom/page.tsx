"use client";



import Link from "next/link";

import { useCallback, useEffect, useState } from "react";

import { getAuthHeaders } from "@/lib/settings-api";



type ZoomAccountRow = {

  id: string;

  display_name: string;

  client_id: string;

  account_id: string;

  is_default: boolean;

};



/**

 * Manage Zoom integration accounts for the current workspace.

 */

export default function SettingsZoomPage(): React.ReactElement {

  const [accounts, setAccounts] = useState<ZoomAccountRow[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [formError, setFormError] = useState<string | null>(null);

  const [formOk, setFormOk] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);



  const [displayName, setDisplayName] = useState("");

  const [clientId, setClientId] = useState("");

  const [clientSecret, setClientSecret] = useState("");

  const [accountId, setAccountId] = useState("");

  const [isDefault, setIsDefault] = useState(false);



  const loadAccounts = useCallback(async (): Promise<void> => {

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

      const res = await fetch(

        `/api/integrations/accounts?workspace_id=${encodeURIComponent(ws)}&provider=zoom`,

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

        setAccounts((json as { data: ZoomAccountRow[] }).data);

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setLoadError((json as { error: string }).error);

      } else {

        setLoadError("Unexpected response when loading accounts.");

      }

    } catch {

      setLoadError("Network error loading accounts.");

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void loadAccounts();

  }, [loadAccounts]);



  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {

    e.preventDefault();

    setFormError(null);

    setFormOk(null);

    const headers = getAuthHeaders();

    const ws = window.localStorage.getItem("workspace_id");

    if (Object.keys(headers).length === 0 || ws === null || ws === "") {

      setFormError("Missing auth_token or workspace_id.");

      return;

    }

    setSubmitting(true);

    try {

      const res = await fetch("/api/integrations/accounts/zoom", {

        method: "POST",

        headers: { ...headers, "Content-Type": "application/json" },

        body: JSON.stringify({

          workspace_id: ws,

          display_name: displayName.trim() === "" ? "Zoom Account" : displayName.trim(),

          client_id: clientId,

          client_secret: clientSecret,

          account_id: accountId,

          is_default: isDefault,

        }),

      });

      const json: unknown = await res.json();

      if (

        typeof json === "object" &&

        json !== null &&

        "success" in json &&

        json.success === true

      ) {

        setFormOk("Zoom account saved.");

        setClientSecret("");

        void loadAccounts();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setFormError((json as { error: string }).error);

      } else {

        setFormError("Unexpected response from server.");

      }

    } catch {

      setFormError("Network error.");

    } finally {

      setSubmitting(false);

    }

  }



  async function handleDelete(id: string): Promise<void> {

    if (!window.confirm("Delete this Zoom integration account?")) {

      return;

    }

    const headers = getAuthHeaders();

    if (Object.keys(headers).length === 0) {

      setLoadError("Missing auth_token or workspace_id.");

      return;

    }

    try {

      const res = await fetch(`/api/integrations/accounts/${id}`, {

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

        void loadAccounts();

      } else if (

        typeof json === "object" &&

        json !== null &&

        "error" in json &&

        typeof (json as { error: unknown }).error === "string"

      ) {

        setLoadError((json as { error: string }).error);

      }

    } catch {

      setLoadError("Network error deleting account.");

    }

  }



  return (

    <div className="mx-auto max-w-3xl space-y-8 p-6">

      <div className="flex items-center justify-between gap-4">

        <div>

          <h1 className="text-xl font-semibold text-slate-900">Zoom credentials</h1>

          <p className="mt-1 text-sm text-slate-600">

            Server-to-Server OAuth accounts for this workspace.

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

        <h2 className="mb-3 text-sm font-semibold text-slate-800">Existing accounts</h2>

        {loading ? (

          <p className="text-sm text-slate-600">Loading…</p>

        ) : loadError !== null ? (

          <p className="text-sm text-red-700">{loadError}</p>

        ) : accounts.length === 0 ? (

          <p className="text-sm text-slate-600">No Zoom accounts yet.</p>

        ) : (

          <ul className="divide-y divide-slate-200">

            {accounts.map((a) => (

              <li

                key={a.id}

                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"

              >

                <div>

                  <span className="font-medium text-slate-900">{a.display_name}</span>

                  <span className="ml-2 text-slate-600">

                    client_id: {a.client_id} · account: {a.account_id}

                    {a.is_default ? (

                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">

                        default

                      </span>

                    ) : null}

                  </span>

                </div>

                <button

                  type="button"

                  onClick={() => void handleDelete(a.id)}

                  className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"

                >

                  Delete

                </button>

              </li>

            ))}

          </ul>

        )}

      </section>



      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">

        <h2 className="mb-3 text-sm font-semibold text-slate-800">Add Zoom account</h2>

        <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>

          <label className="block text-sm text-slate-700">

            Display name

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={displayName}

              onChange={(e) => setDisplayName(e.target.value)}

              placeholder="Zoom Account"

            />

          </label>

          <label className="block text-sm text-slate-700">

            Client ID

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={clientId}

              onChange={(e) => setClientId(e.target.value)}

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Client secret

            <input

              type="password"

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={clientSecret}

              onChange={(e) => setClientSecret(e.target.value)}

              required

            />

          </label>

          <label className="block text-sm text-slate-700">

            Account ID

            <input

              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"

              value={accountId}

              onChange={(e) => setAccountId(e.target.value)}

              required

            />

          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">

            <input

              type="checkbox"

              checked={isDefault}

              onChange={(e) => setIsDefault(e.target.checked)}

            />

            Set as default for this workspace

          </label>

          {formError !== null ? (

            <p className="text-sm text-red-700">{formError}</p>

          ) : null}

          {formOk !== null ? (

            <p className="text-sm text-green-800">{formOk}</p>

          ) : null}

          <button

            type="submit"

            disabled={submitting}

            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"

          >

            {submitting ? "Saving…" : "Save Zoom account"}

          </button>

        </form>

      </section>

    </div>

  );

}


