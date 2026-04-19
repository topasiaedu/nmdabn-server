"use client";

import { useSettingsContext } from "@/lib/settings-context";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Settings, Settings2 } from "lucide-react";
import type { ProjectItem } from "@/features/traffic/types";
import { fetchProjects } from "@/features/traffic/services/api";

export function SettingsSidebar(): React.ReactElement {
  const { accessToken, workspaceId } = useSettingsContext();
  const pathname = usePathname();

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const result = await fetchProjects(accessToken, workspaceId);
        if (!cancelled) {
          setProjects(result);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, workspaceId]);

  return (
    <div className="w-64 shrink-0 px-4 py-6 border-r border-slate-200">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-4">
        Workspace
      </h2>
      <nav className="space-y-1 mb-8">
        <Link
          href="/settings"
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            pathname === "/settings"
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Settings size={16} />
          General
        </Link>
        <Link
          href="/settings/integrations"
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            pathname.startsWith("/settings/integrations")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Settings2 size={16} />
          Webinar Runs
        </Link>
      </nav>

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-4">
        Projects
      </h2>
      {loading ? (
        <div className="px-3 text-sm text-slate-400">Loading...</div>
      ) : (
        <nav className="space-y-1">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/settings/projects/${project.id}`}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname.startsWith(`/settings/projects/${project.id}`)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <FolderKanban size={16} className="shrink-0" />
              <span className="truncate">{project.name}</span>
            </Link>
          ))}
          <Link
            href="/settings?createProject=true"
            className="flex items-center gap-2 px-3 py-2 mt-2 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-dashed border-slate-300"
          >
            + New Project
          </Link>
        </nav>
      )}
    </div>
  );
}
