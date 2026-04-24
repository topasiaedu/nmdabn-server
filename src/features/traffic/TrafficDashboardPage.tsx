"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, FileUp, Users } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashboardContext } from "@/components/DashboardContext";
import { ColumnTable } from "@/components/ColumnTable";
import type { AllRunsPayload } from "@/lib/all-runs-pivot";
import type { OptinImportProgress } from "@/services/optin-journey-import";

function buildDashboardAuthHeaders(
  token: string
): Record<string, string> {
  if (token.trim() === "") return {};
  return { Authorization: `Bearer ${token}` };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Must match canonical order in `GET /api/dashboard/traffic` and the RPC. */
const UTM_AXIS_ORDER = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

type UtmAxisId = (typeof UTM_AXIS_ORDER)[number];

const UTM_AXIS_LABELS: Record<UtmAxisId, string> = {
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_content: "Content",
};

function orderedUtmAxes(selection: ReadonlySet<string>): UtmAxisId[] {
  return UTM_AXIS_ORDER.filter((a) => selection.has(a));
}

async function fetchTrafficAllRuns(
  accessToken: string,
  workspaceId: string,
  projectId: string,
  lineKey: string,
  utmAxes: readonly UtmAxisId[]
): Promise<AllRunsPayload> {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
  });
  if (utmAxes.length > 0) {
    qs.set("dimensions", utmAxes.join(","));
  }
  if (lineKey !== "" && lineKey !== "All") {
    qs.set("line", lineKey);
  }
  const res = await fetch(`/api/dashboard/traffic?${qs.toString()}`, {
    headers: buildDashboardAuthHeaders(accessToken),
  });
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error("Invalid response");
  if (!res.ok || body.success === false) {
    throw new Error(
      typeof body.error === "string" ? body.error : `HTTP ${res.status}`
    );
  }
  return body.data as AllRunsPayload;
}

/** When project has no custom agency map, offer the same defaults as the server env. */
const FALLBACK_AGENCY_KEYS = ["OM", "NM"] as const;

type OptinImportResponse = {
  imported: number;
  skippedDuplicates: number;
  attributionUpdated: number;
  skippedInvalid: number;
  errors: Array<{ rowNumber: number; message: string }>;
};

type PersistedOptinImport = {
  finishedAt: string;
  agency_line: string;
  result: OptinImportResponse;
};

function reportStorageKey(projectId: string): string {
  return `nmdabn-traffic-optin-import-report:${projectId}`;
}

function readPersistedImport(projectId: string): PersistedOptinImport | null {
  if (typeof window === "undefined" || projectId.trim() === "") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(reportStorageKey(projectId));
    if (raw === null || raw.trim() === "") {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    const finishedAt =
      typeof parsed.finishedAt === "string" ? parsed.finishedAt : "";
    const agency_line =
      typeof parsed.agency_line === "string" ? parsed.agency_line : "";
    if (!isRecord(parsed.result)) {
      return null;
    }
    return {
      finishedAt,
      agency_line,
      result: parseOptinResultRecord(parsed.result),
    };
  } catch {
    return null;
  }
}

function writePersistedImport(
  projectId: string,
  payload: PersistedOptinImport
): void {
  if (typeof window === "undefined" || projectId.trim() === "") {
    return;
  }
  window.localStorage.setItem(
    reportStorageKey(projectId),
    JSON.stringify(payload)
  );
}

function clearPersistedImport(projectId: string): void {
  if (typeof window === "undefined" || projectId.trim() === "") {
    return;
  }
  window.localStorage.removeItem(reportStorageKey(projectId));
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadOptinImportErrorsCsv(result: OptinImportResponse): void {
  const lines: string[] = ["row_number,message"];
  for (const er of result.errors) {
    lines.push(
      `${String(er.rowNumber)},${escapeCsvCell(er.message)}`
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `optin-import-errors-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseOptinResultRecord(r: Record<string, unknown>): OptinImportResponse {
  return {
    imported: typeof r.imported === "number" ? r.imported : 0,
    skippedDuplicates:
      typeof r.skippedDuplicates === "number" ? r.skippedDuplicates : 0,
    attributionUpdated:
      typeof r.attributionUpdated === "number" ? r.attributionUpdated : 0,
    skippedInvalid:
      typeof r.skippedInvalid === "number" ? r.skippedInvalid : 0,
    errors: Array.isArray(r.errors)
      ? (r.errors as OptinImportResponse["errors"])
      : [],
  };
}

/**
 * Streams NDJSON progress events from POST …/optin-import with `stream: true`.
 */
async function postOptinSheetImportStream(
  accessToken: string,
  workspaceId: string,
  projectId: string,
  agencyLine: string,
  csvText: string,
  onProgress: (p: OptinImportProgress) => void
): Promise<OptinImportResponse> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/journey/optin-import`,
    {
      method: "POST",
      headers: {
        ...buildDashboardAuthHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        agency_line: agencyLine,
        csv_text: csvText,
        stream: true,
      }),
    }
  );

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    if (!isRecord(body)) {
      throw new Error(`HTTP ${res.status}`);
    }
    throw new Error(
      typeof body.error === "string" ? body.error : `HTTP ${res.status}`
    );
  }

  const reader = res.body?.getReader();
  if (reader === undefined) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: OptinImportResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") {
        continue;
      }
      let ev: unknown;
      try {
        ev = JSON.parse(trimmed) as unknown;
      } catch {
        continue;
      }
      if (!isRecord(ev) || typeof ev.type !== "string") {
        continue;
      }
      if (ev.type === "progress") {
        onProgress({
          total: typeof ev.total === "number" ? ev.total : 0,
          current: typeof ev.current === "number" ? ev.current : 0,
          sheetRowNumber:
            typeof ev.sheetRowNumber === "number" ? ev.sheetRowNumber : 0,
          email: typeof ev.email === "string" ? ev.email : "",
          message: typeof ev.message === "string" ? ev.message : "",
        });
      } else if (ev.type === "complete" && isRecord(ev.result)) {
        finalResult = parseOptinResultRecord(ev.result);
      } else if (ev.type === "error" && typeof ev.message === "string") {
        throw new Error(ev.message);
      }
    }
  }

  if (finalResult === null) {
    throw new Error("Import stream ended without a result");
  }
  return finalResult;
}

type TrafficInnerProps = {
  ctx: DashboardContext;
};

function TrafficInner({ ctx }: TrafficInnerProps): React.ReactElement {
  const {
    accessToken,
    workspaceId,
    projectId,
    ghlLocationId,
    projectAgencyLineTags,
  } = ctx;

  const availableLines = useMemo<string[]>(() => {
    if (projectAgencyLineTags === null) return ["All"];
    return ["All", ...Object.keys(projectAgencyLineTags)];
  }, [projectAgencyLineTags]);

  const [activeLine, setActiveLine] = useState<string>("All");
  /** Subset of UTM fields to combine into each table row (default: content only). */
  const [utmSelection, setUtmSelection] = useState<Set<string>>(
    () => new Set<string>(["utm_content"])
  );
  const [payload, setPayload] = useState<AllRunsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const agencyKeysForImport = useMemo(() => {
    if (projectAgencyLineTags === null) {
      return [...FALLBACK_AGENCY_KEYS];
    }
    const keys = Object.keys(projectAgencyLineTags);
    return keys.length > 0 ? keys : [...FALLBACK_AGENCY_KEYS];
  }, [projectAgencyLineTags]);

  const [importAgencyLine, setImportAgencyLine] = useState<string>("OM");
  const [importCsvText, setImportCsvText] = useState<string>("");
  const [importSubmitting, setImportSubmitting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<OptinImportResponse | null>(
    null
  );
  /** Last completed import (browser localStorage) so errors survive refresh. */
  const [persistedImport, setPersistedImport] =
    useState<PersistedOptinImport | null>(null);
  const [importProgress, setImportProgress] = useState<OptinImportProgress | null>(
    null
  );

  useEffect(() => {
    if (agencyKeysForImport.includes(importAgencyLine)) {
      return;
    }
    setImportAgencyLine(agencyKeysForImport[0] ?? "OM");
  }, [agencyKeysForImport, importAgencyLine]);

  useEffect(() => {
    if (projectId.trim() === "") {
      setPersistedImport(null);
      return;
    }
    setPersistedImport(readPersistedImport(projectId));
  }, [projectId]);

  const importSummary: OptinImportResponse | null =
    importResult ?? persistedImport?.result ?? null;

  const utmAxesOrdered = useMemo(
    () => orderedUtmAxes(utmSelection),
    [utmSelection]
  );

  useEffect(() => {
    if (!availableLines.includes(activeLine)) {
      setActiveLine("All");
    }
  }, [availableLines, activeLine]);

  const canLoad = workspaceId !== "" && projectId !== "";

  const load = useCallback(async (): Promise<void> => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTrafficAllRuns(
        accessToken,
        workspaceId,
        projectId,
        activeLine,
        utmAxesOrdered
      );
      setPayload(result);
    } catch (err) {
      setPayload(null);
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId, projectId, activeLine, utmAxesOrdered, canLoad]);

  useEffect(() => {
    if (canLoad) void load();
  }, [canLoad, load]);

  if (ghlLocationId === null) {
    return (
      <div className="mx-6 mt-6 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-4 flex items-start gap-4">
        <AlertCircle size={20} className="text-amber-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-amber-800">
            GHL location unconfigured
          </h3>
          <p className="mt-1 text-sm text-amber-700">
            Traffic numbers pull from GoHighLevel, but no GHL location ID is
            tied to this project.
          </p>
          <Link
            href={`/settings/projects/${projectId}?tab=ghl`}
            className="inline-block mt-3 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
          >
            Configure →
          </Link>
        </div>
      </div>
    );
  }

  const isEmpty =
    payload !== null &&
    payload.sections.every((s) => s.rows.length === 0);

  return (
    <div className="mx-6 mt-6 max-w-7xl pb-16">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Traffic
        </h1>
      </div>

      {/* Agency line filter tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {availableLines.map((line) => (
          <button
            key={line}
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors border ${
              line === activeLine
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            onClick={() => setActiveLine(line)}
          >
            {line}
          </button>
        ))}
      </div>

      <div className="mb-8">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          UTM dimensions (journey opt-in)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {UTM_AXIS_ORDER.map((axis) => {
            const on = utmSelection.has(axis);
            return (
              <button
                key={axis}
                type="button"
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors border ${
                  on
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => {
                  setUtmSelection((prev) => {
                    const next = new Set(prev);
                    if (next.has(axis)) {
                      if (next.size <= 1) {
                        return prev;
                      }
                      next.delete(axis);
                    } else {
                      next.add(axis);
                    }
                    return next;
                  });
                }}
              >
                {UTM_AXIS_LABELS[axis]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Rows use the latest <strong>opt-in</strong> row in contact journey
          (sheet import + manual); combinations follow the selected dimensions;
          counts are unique contacts per webinar run.
        </p>
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileUp size={18} className="text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-800">
            Import opt-in history (Google Sheet CSV)
          </h2>
        </div>
        <p className="text-xs text-slate-600 mb-4">
          Export your tab as CSV (same columns as the CAE webinar tracking sheet:
          Date Time, Full Name, Email, Phone Number, UTM fields). Timestamps are
          interpreted as <strong>Kuala Lumpur</strong> local time. Each row
          creates one <code className="text-xs bg-white px-1 rounded">optin</code>{" "}
          journey event, merges agency tags in GHL, and syncs the contact
          mirror.
        </p>
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label
              htmlFor="import-agency-line"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Agency line (GHL tags)
            </label>
            <select
              id="import-agency-line"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 min-w-[120px]"
              value={importAgencyLine}
              onChange={(e) => {
                setImportAgencyLine(e.target.value);
              }}
            >
              {agencyKeysForImport.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              CSV file
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-sm text-slate-700 max-w-[220px]"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file === undefined) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const text =
                    typeof reader.result === "string" ? reader.result : "";
                  setImportCsvText(text);
                };
                reader.readAsText(file);
              }}
            />
          </div>
        </div>
        <label
          htmlFor="import-csv-paste"
          className="block text-xs font-medium text-slate-600 mb-1"
        >
          Or paste CSV
        </label>
        <textarea
          id="import-csv-paste"
          className="w-full min-h-[120px] text-xs font-mono border border-slate-200 rounded-lg p-3 bg-white text-slate-800 mb-3"
          placeholder='Date Time,Full Name,Email,...'
          value={importCsvText}
          onChange={(e) => {
            setImportCsvText(e.target.value);
          }}
        />
        {importProgress !== null && (
          <div
            className={`mb-4 p-3 rounded-lg border shadow-sm ${
              importSubmitting
                ? "bg-white border-indigo-100"
                : "bg-slate-50 border-slate-200"
            }`}
            aria-live="polite"
          >
            {importSubmitting && importProgress.total === 0 ? (
              <p className="text-xs text-slate-700 flex items-center gap-2">
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
                  aria-hidden
                />
                {importProgress.message}
              </p>
            ) : importProgress.total > 0 ? (
              <>
                <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                  <span>
                    Row {importProgress.current} / {importProgress.total}
                    {importProgress.sheetRowNumber > 0
                      ? ` · sheet #${importProgress.sheetRowNumber}`
                      : ""}
                  </span>
                  <span className="tabular-nums font-medium text-indigo-700">
                    {Math.min(
                      100,
                      Math.round(
                        (importProgress.current / importProgress.total) * 100
                      )
                    )}
                    %
                  </span>
                </div>
                <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-[width] duration-300 ease-out"
                    style={{
                      width: `${Math.min(
                        100,
                        (importProgress.current / importProgress.total) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-800 mt-2 leading-relaxed">
                  {importProgress.message}
                </p>
                {importProgress.email !== "" && (
                  <p
                    className="text-xs text-slate-500 mt-1 truncate"
                    title={importProgress.email}
                  >
                    {importProgress.email}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-600">{importProgress.message}</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={
              importSubmitting ||
              importCsvText.trim() === "" ||
              workspaceId === "" ||
              projectId === ""
            }
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              void (async () => {
                setImportSubmitting(true);
                setImportError(null);
                setImportResult(null);
                setImportProgress({
                  total: 0,
                  current: 0,
                  sheetRowNumber: 0,
                  email: "",
                  message: "Connecting to server…",
                });
                try {
                  const result = await postOptinSheetImportStream(
                    accessToken,
                    workspaceId,
                    projectId,
                    importAgencyLine,
                    importCsvText,
                    (p) => {
                      setImportProgress(p);
                    }
                  );
                  setImportResult(result);
                  const snapshot: PersistedOptinImport = {
                    finishedAt: new Date().toISOString(),
                    agency_line: importAgencyLine,
                    result,
                  };
                  writePersistedImport(projectId, snapshot);
                  setPersistedImport(snapshot);
                  void load();
                } catch (err) {
                  setImportError(
                    err instanceof Error ? err.message : "Import failed"
                  );
                } finally {
                  setImportSubmitting(false);
                }
              })();
            }}
          >
            {importSubmitting ? "Importing…" : "Run import"}
          </button>
          {importError !== null && (
            <span className="text-sm text-red-600">{importError}</span>
          )}
        </div>
        {importSummary !== null && (
          <div className="mt-4 text-sm text-slate-700 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            {persistedImport !== null &&
              importResult === null &&
              persistedImport.finishedAt !== "" && (
                <p className="text-xs text-slate-500">
                  Showing saved report from{" "}
                  {new Date(persistedImport.finishedAt).toLocaleString()} (agency{" "}
                  <strong>{persistedImport.agency_line}</strong>). Refresh-safe
                  — use Download if you need a copy.
                </p>
              )}
            <p>
              Imported <strong>{importSummary.imported}</strong>,
              {importSummary.attributionUpdated > 0 && (
                <> attribution updated <strong>{importSummary.attributionUpdated}</strong>,</>
              )}
              {" "}skipped duplicates <strong>{importSummary.skippedDuplicates}</strong>,
              invalid rows <strong>{importSummary.skippedInvalid}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              {importSummary.errors.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
                  onClick={() => {
                    downloadOptinImportErrorsCsv(importSummary);
                  }}
                >
                  Download errors CSV ({importSummary.errors.length})
                </button>
              )}
              <button
                type="button"
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600"
                onClick={() => {
                  clearPersistedImport(projectId);
                  setPersistedImport(null);
                  setImportResult(null);
                }}
              >
                Dismiss saved report
              </button>
            </div>
            {importSummary.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-red-700 max-h-64 overflow-y-auto border-t border-slate-100 pt-2">
                {importSummary.errors.slice(0, 200).map((er, idx) => (
                  <li key={`${idx}-${er.rowNumber}`}>
                    Row {er.rowNumber}: {er.message}
                  </li>
                ))}
                {importSummary.errors.length > 200 && (
                  <li className="list-none text-slate-500">
                    …and {importSummary.errors.length - 200} more (use Download
                    for full list)
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {loading && (
        <p className="text-sm text-slate-500 mb-4">Loading…</p>
      )}
      {error !== null && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-6">
            <Users size={32} className="text-indigo-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            No traffic data found
          </h2>
          <p className="text-sm text-slate-500 max-w-md">
            No leads matched your current filters. Make sure your GHL location
            is synced and contacts are tagged correctly for this line.
          </p>
        </div>
      ) : payload !== null ? (
        <ColumnTable
          columns={payload.columns}
          sections={payload.sections}
          showPercentToggle
        />
      ) : null}
    </div>
  );
}

/** Traffic breakdown across all webinar runs as column table. */
export function TrafficDashboardPage(): React.ReactElement {
  useEffect(() => {
    document.title = "Traffic — NM Media";
  }, []);

  return (
    <DashboardShell>{(ctx) => <TrafficInner ctx={ctx} />}</DashboardShell>
  );
}
