"use client";

import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { SettingsShell } from "@/components/SettingsShell";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { useSettingsContext } from "@/lib/settings-context";

type WorkspaceRow = {
  id: string;
  name: string;
  role: string;
};

function SettingsIndexContent(): React.ReactElement {
  const { accessToken, workspaceId } = useSettingsContext();

  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace(): Promise<void> {
      try {
        const res = await fetch("/api/workspaces", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json: unknown = await res.json();
        if (
          !cancelled &&
          typeof json === "object" &&
          json !== null &&
          "data" in json &&
          Array.isArray((json as { data: unknown }).data)
        ) {
          const rows = (json as { data: WorkspaceRow[] }).data;
          setWorkspace(rows.find((r) => r.id === workspaceId) ?? null);
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load workspace info.");
      }
    }
    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [accessToken, workspaceId]);

  async function handleCreateProject(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    if (newName.trim() === "") return;

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspace_id: workspaceId, name: newName.trim() }),
      });
      const json: unknown = await res.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "success" in json &&
        (json as { success: unknown }).success === true
      ) {
        // Refresh by reloading the page so sidebar picks it up
        window.location.reload();
      } else {
        setCreateError("Failed to create project.");
      }
    } catch {
      setCreateError("Network error creating project.");
    } finally {
      setCreating(false);
    }
  }

  function handleCopyWorkspaceId(): void {
    void navigator.clipboard.writeText(workspaceId);
  }

  return (
    <div className="flex bg-slate-50 min-h-[calc(100vh-56px)]">
      <SettingsSidebar />
      <div className="flex-1 p-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">
          Workspace Settings
        </h1>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              General Information
            </h2>
          </div>
          <div className="px-6 py-5 space-y-6">
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">
                Workspace Name
              </span>
              <div className="text-base text-slate-900">
                {workspace !== null ? workspace.name : loadError !== null ? loadError : "..."}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">
                Workspace ID
              </span>
              <div className="flex items-center gap-3">
                <code className="text-sm bg-slate-100 px-3 py-1.5 rounded-md text-slate-800 font-mono select-all">
                  {workspaceId}
                </code>
                <button
                  type="button"
                  title="Copy Workspace ID"
                  onClick={handleCopyWorkspaceId}
                  className="text-slate-400 hover:text-slate-600 focus:outline-none focus:text-indigo-600 transition-colors"
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                You will need this ID for external integrations or server cron jobs
                (e.g., Render background workers).
              </p>
            </div>
          </div>
        </div>

        <div id="create-project" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Create New Project
            </h2>
          </div>
          <div className="px-6 py-5">
            <form onSubmit={(e) => void handleCreateProject(e)} className="flex items-start gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Project name (e.g. CA Elite)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {createError !== null && (
                  <p className="mt-2 text-sm text-red-600">{createError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <Plus size={16} />
                {creating ? "Creating..." : "Create Project"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsIndexPage(): React.ReactElement {
  useEffect(() => {
    document.title = "Settings — NM Media";
  }, []);

  return (
    <SettingsShell>
      <SettingsIndexContent />
    </SettingsShell>
  );
}
