"use client";

/**
 * Full Meta Ads Manager dashboard with:
 * - Flexible date range picker (presets + custom start/end inputs)
 * - Summary KPI bar (spend, impressions, clicks, CTR, CPM, CPC)
 * - 3-level drill-down table: Campaigns → Ad Sets → Ads
 * - Sync button with per-account diagnostic output
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Eye,
  MousePointerClick,
  RefreshCw,
  Settings,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { KpiCard } from "@/components/KpiCard";
import type { DashboardContext } from "@/components/DashboardContext";
import { fetchAdsManagerData } from "@/features/ads-manager/services/api";
import type {
  AdsManagerBreadcrumb,
  AdsManagerLevel,
  AdsManagerPayload,
  AdsManagerRow,
  AdsManagerSummary,
} from "@/features/ads-manager/types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return toIsoDate(new Date());
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function firstDayOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  return toIsoDate(d);
}

function firstDayOfLastMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return toIsoDate(d);
}

function lastDayOfLastMonthIso(): string {
  const d = new Date();
  d.setDate(0);
  return toIsoDate(d);
}

// ---------------------------------------------------------------------------
// Number formatters
// ---------------------------------------------------------------------------

function formatCurrency(
  amount: number,
  currency: string
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(2)}%`;
}

function formatMoney(v: number, currency: string): string {
  return formatCurrency(v, currency);
}

// ---------------------------------------------------------------------------
// Preset date ranges
// ---------------------------------------------------------------------------

type DatePreset = {
  label: string;
  from: string;
  to: string;
};

function buildPresets(): DatePreset[] {
  return [
    { label: "Today", from: todayIso(), to: todayIso() },
    { label: "Yesterday", from: daysAgoIso(1), to: daysAgoIso(1) },
    { label: "Last 7 days", from: daysAgoIso(7), to: todayIso() },
    { label: "Last 14 days", from: daysAgoIso(14), to: todayIso() },
    { label: "Last 30 days", from: daysAgoIso(30), to: todayIso() },
    { label: "Last 90 days", from: daysAgoIso(90), to: todayIso() },
    {
      label: "This month",
      from: firstDayOfMonthIso(),
      to: todayIso(),
    },
    {
      label: "Last month",
      from: firstDayOfLastMonthIso(),
      to: lastDayOfLastMonthIso(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function statusBadgeClasses(status: string | null): string {
  const s = (status ?? "").toUpperCase();
  if (s === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "PAUSED") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "DELETED" || s === "ARCHIVED") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  return "bg-slate-50 text-slate-500 border-slate-200";
}

// ---------------------------------------------------------------------------
// Sync button & result types
// ---------------------------------------------------------------------------

type SyncLineResult = {
  agencyLine: string;
  campaignsUpserted: number;
  adsetsUpserted: number;
  adsUpserted: number;
  insightRowsUpserted: number;
  adsetInsightRowsUpserted: number;
  adInsightRowsUpserted: number;
  error?: string;
};

type SyncResultBody = {
  accountsProcessed: number;
  campaignsUpserted: number;
  adsetsUpserted: number;
  adsUpserted: number;
  insightRowsUpserted: number;
  adsetInsightRowsUpserted: number;
  adInsightRowsUpserted: number;
  lines: SyncLineResult[];
};

function isSyncResultBody(v: unknown): v is SyncResultBody {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["accountsProcessed"] === "number" &&
    typeof r["campaignsUpserted"] === "number" &&
    Array.isArray(r["lines"])
  );
}

// ---------------------------------------------------------------------------
// SyncButton component
// ---------------------------------------------------------------------------

type SyncButtonProps = Readonly<{
  accessToken: string;
  workspaceId: string;
  projectId: string;
  onSyncComplete: () => void;
}>;

function SyncButton({
  accessToken,
  workspaceId,
  projectId,
  onSyncComplete,
}: SyncButtonProps): React.ReactElement {
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResultBody | null>(null);

  const handleSync = useCallback(async (): Promise<void> => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/actions/sync/meta-ads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          project_id: projectId,
        }),
      });
      const body: unknown = await res.json();
      const isRecord = (x: unknown): x is Record<string, unknown> =>
        typeof x === "object" && x !== null && !Array.isArray(x);
      const isFailure =
        isRecord(body) && body["success"] === false;

      if (!res.ok || isFailure) {
        const errMsg = isRecord(body) && typeof body["error"] === "string"
          ? body["error"]
          : `HTTP ${res.status}`;
        setSyncError(errMsg);
      } else {
        const resultData = isRecord(body) ? body["data"] ?? body : body;
        setSyncResult(isSyncResultBody(resultData) ? resultData : null);
        onSyncComplete();
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [accessToken, workspaceId, projectId, onSyncComplete]);

  return (
    <div className="flex flex-col gap-2 items-end">
      <button
        type="button"
        onClick={() => { void handleSync(); }}
        disabled={syncing}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
        {syncing ? "Syncing…" : "Sync Now"}
      </button>

      {syncError !== null && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle size={12} />
          {syncError}
        </div>
      )}

      {syncResult !== null && (
        <div className="flex flex-col gap-1 items-end">
          <span className="text-xs text-emerald-600 font-medium">
            {`Synced: ${syncResult.campaignsUpserted} campaigns, ${syncResult.adsetsUpserted} ad sets, ${syncResult.adsUpserted} ads`}
          </span>
          <span className="text-xs text-slate-500">
            {`${syncResult.insightRowsUpserted} campaign insights, ${syncResult.adsetInsightRowsUpserted} adset insights, ${syncResult.adInsightRowsUpserted} ad insights`}
          </span>
          {syncResult.lines.map((line) =>
            line.error === undefined ? null : (
              <span
                key={line.agencyLine}
                className="flex items-center gap-1 text-xs text-red-600"
              >
                <AlertCircle size={12} />
                {`${line.agencyLine}: ${line.error}`}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateRangePicker component
// ---------------------------------------------------------------------------

type DateRangePickerProps = Readonly<{
  dateFrom: string;
  dateTo: string;
  onApply: (from: string, to: string) => void;
}>;

function DateRangePicker({
  dateFrom,
  dateTo,
  onApply,
}: DateRangePickerProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const [draftFrom, setDraftFrom] = useState<string>(dateFrom);
  const [draftTo, setDraftTo] = useState<string>(dateTo);
  const [activePreset, setActivePreset] = useState<string>("Last 30 days");
  const containerRef = useRef<HTMLDivElement>(null);

  const presets = buildPresets();

  useEffect(() => {
    if (!open) {
      setDraftFrom(dateFrom);
      setDraftTo(dateTo);
    }
  }, [open, dateFrom, dateTo]);

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (
        containerRef.current !== null &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  function applyPreset(preset: DatePreset): void {
    setDraftFrom(preset.from);
    setDraftTo(preset.to);
    setActivePreset(preset.label);
    onApply(preset.from, preset.to);
    setOpen(false);
  }

  function applyCustom(): void {
    if (draftFrom !== "" && draftTo !== "") {
      setActivePreset("Custom");
      onApply(draftFrom, draftTo);
      setOpen(false);
    }
  }

  function formatDisplayLabel(): string {
    if (activePreset !== "Custom" && activePreset !== "") {
      return activePreset;
    }
    return `${dateFrom} → ${dateTo}`;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <CalendarDays size={14} className="text-slate-500" />
        {formatDisplayLabel()}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[440px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="flex">
            {/* Presets sidebar */}
            <div className="w-40 bg-slate-50 border-r border-slate-200 p-2 flex flex-col gap-0.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                    activePreset === preset.label
                      ? "bg-indigo-600 text-white font-medium"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            <div className="flex-1 p-4 flex flex-col gap-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Custom range
              </p>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Start date</span>
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo === "" ? todayIso() : draftTo}
                  onChange={(e) => {
                    setDraftFrom(e.target.value);
                    setActivePreset("Custom");
                  }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">End date</span>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom === "" ? undefined : draftFrom}
                  max={todayIso()}
                  onChange={(e) => {
                    setDraftTo(e.target.value);
                    setActivePreset("Custom");
                  }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <button
                type="button"
                onClick={applyCustom}
                disabled={draftFrom === "" || draftTo === ""}
                className="mt-auto w-full bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI summary bar
// ---------------------------------------------------------------------------

type SummaryBarProps = Readonly<{
  summary: AdsManagerSummary;
}>;

function SummaryBar({ summary }: SummaryBarProps): React.ReactElement {
  const currency = summary.currency;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
      <KpiCard
        title="Spend"
        value={formatMoney(summary.total_spend, currency)}
        icon={<DollarSign size={20} />}
      />
      <KpiCard
        title="Impressions"
        value={formatNumber(summary.total_impressions)}
        icon={<Eye size={20} />}
      />
      <KpiCard
        title="Clicks"
        value={formatNumber(summary.total_clicks)}
        icon={<MousePointerClick size={20} />}
      />
      <KpiCard
        title="Reach"
        value={formatNumber(summary.total_reach)}
        icon={<Users size={20} />}
      />
      <KpiCard
        title="Leads"
        value={summary.total_leads === null ? "—" : formatNumber(summary.total_leads)}
        icon={<Target size={20} />}
        badge={summary.total_leads !== null && summary.total_leads > 0 ? "Live" : undefined}
        badgeColor="green"
      />
      <KpiCard
        title="CPL"
        value={summary.cost_per_lead === null ? "—" : formatMoney(summary.cost_per_lead, currency)}
        icon={<DollarSign size={20} />}
      />
      <KpiCard
        title="CTR"
        value={formatPct(summary.ctr)}
        icon={<TrendingUp size={20} />}
        badge={summary.ctr !== null && summary.ctr >= 2 ? "Good" : undefined}
        badgeColor="green"
      />
      <KpiCard
        title="CPM"
        value={summary.cpm === null ? "—" : formatMoney(summary.cpm, currency)}
        icon={<DollarSign size={20} />}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb component
// ---------------------------------------------------------------------------

type BreadcrumbProps = Readonly<{
  level: AdsManagerLevel;
  campaignContext: AdsManagerBreadcrumb | null;
  adsetContext: AdsManagerBreadcrumb | null;
  onNavigateCampaigns: () => void;
  onNavigateCampaign: (id: string, name: string) => void;
}>;

function Breadcrumb({
  level,
  campaignContext,
  adsetContext,
  onNavigateCampaigns,
  onNavigateCampaign,
}: BreadcrumbProps): React.ReactElement {
  if (level === "campaign") {
    return (
      <span className="text-sm font-semibold text-slate-800">Campaigns</span>
    );
  }

  return (
    <div className="flex items-center gap-1 text-sm flex-wrap">
      <button
        type="button"
        onClick={onNavigateCampaigns}
        className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
      >
        Campaigns
      </button>

      {campaignContext !== null && (
        <>
          <ChevronRight size={14} className="text-slate-400" />
          {level === "ad" ? (
            <button
              type="button"
              onClick={() => {
                if (campaignContext !== null) {
                  onNavigateCampaign(campaignContext.id, campaignContext.name);
                }
              }}
              className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              {campaignContext.name}
            </button>
          ) : (
            <span className="font-semibold text-slate-800">
              {campaignContext.name}
            </span>
          )}
        </>
      )}

      {level === "ad" && adsetContext !== null && (
        <>
          <ChevronRight size={14} className="text-slate-400" />
          <span className="font-semibold text-slate-800">
            {adsetContext.name}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity table
// ---------------------------------------------------------------------------

type SortKey =
  | "entity_name"
  | "spend"
  | "impressions"
  | "clicks"
  | "reach"
  | "leads"
  | "cost_per_lead"
  | "ctr"
  | "cpm"
  | "cpc";

type SortDir = "asc" | "desc";

function columnHeader(
  label: string,
  key: SortKey,
  sortKey: SortKey,
  sortDir: SortDir,
  onSort: (k: SortKey) => void
): React.ReactElement {
  const active = sortKey === key;
  return (
    <th
      key={key}
      className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-slate-700"
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        {active && (
          <span className="text-indigo-600">{sortDir === "desc" ? "↓" : "↑"}</span>
        )}
      </span>
    </th>
  );
}

function levelColumnLabel(level: AdsManagerLevel): string {
  if (level === "adset") return "Ad Set";
  if (level === "ad") return "Ad";
  return "Campaign";
}

type EntityTableProps = Readonly<{
  rows: AdsManagerRow[];
  level: AdsManagerLevel;
  currency: string;
  onDrillDown: (row: AdsManagerRow) => void;
}>;

function EntityTable({
  rows,
  level,
  currency,
  onDrillDown,
}: EntityTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const mul = sortDir === "desc" ? -1 : 1;
    if (sortKey === "entity_name") {
      return mul * a.entity_name.localeCompare(b.entity_name);
    }
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    if (typeof aVal === "number" && typeof bVal === "number") {
      return mul * (aVal - bVal);
    }
    return 0;
  });

  const canDrillDown = level !== "ad";
  const entityLabel = levelColumnLabel(level);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-64">
                {entityLabel}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Status
              </th>
              {columnHeader("Spend", "spend", sortKey, sortDir, handleSort)}
              {columnHeader("Impressions", "impressions", sortKey, sortDir, handleSort)}
              {columnHeader("Clicks", "clicks", sortKey, sortDir, handleSort)}
              {columnHeader("Reach", "reach", sortKey, sortDir, handleSort)}
              {columnHeader("Leads", "leads", sortKey, sortDir, handleSort)}
              {columnHeader("CPL", "cost_per_lead", sortKey, sortDir, handleSort)}
              {columnHeader("CTR", "ctr", sortKey, sortDir, handleSort)}
              {columnHeader("CPM", "cpm", sortKey, sortDir, handleSort)}
              {columnHeader("CPC", "cpc", sortKey, sortDir, handleSort)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => (
              <tr
                key={row.entity_id}
                className={`hover:bg-slate-50 transition-colors ${canDrillDown ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (canDrillDown) onDrillDown(row);
                }}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={`font-medium text-slate-900 ${canDrillDown ? "text-indigo-700 hover:underline" : ""}`}
                    >
                      {row.entity_name}
                    </span>
                    {row.entity_label !== null && (
                      <span className="text-xs text-slate-400">
                        {row.entity_label}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {row.entity_status !== null && (
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${statusBadgeClasses(row.entity_status)}`}
                    >
                      {row.entity_status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                  {formatMoney(row.spend, currency)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                  {formatNumber(row.impressions)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                  {formatNumber(row.clicks)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                  {formatNumber(row.reach)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {row.leads === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="font-medium text-indigo-700">
                      {formatNumber(row.leads)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {row.cost_per_lead === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="font-medium text-emerald-700">
                      {formatMoney(row.cost_per_lead, currency)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                  {formatPct(row.ctr)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                  {row.cpm === null ? "—" : formatMoney(row.cpm, currency)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                  {row.cpc === null ? "—" : formatMoney(row.cpc, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content (inside DashboardShell)
// ---------------------------------------------------------------------------

type DrillDownState = {
  level: AdsManagerLevel;
  campaignContext: AdsManagerBreadcrumb | null;
  adsetContext: AdsManagerBreadcrumb | null;
  campaignId: string;
  adsetId: string;
};

function initialDrillDown(): DrillDownState {
  return {
    level: "campaign",
    campaignContext: null,
    adsetContext: null,
    campaignId: "",
    adsetId: "",
  };
}

type AdsManagerContentProps = Readonly<{
  ctx: DashboardContext;
}>;

function AdsManagerContent({
  ctx,
}: AdsManagerContentProps): React.ReactElement {
  const { accessToken, workspaceId, projectId } = ctx;

  const [dateFrom, setDateFrom] = useState<string>(daysAgoIso(30));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [drillDown, setDrillDown] = useState<DrillDownState>(initialDrillDown());
  const [payload, setPayload] = useState<AdsManagerPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (
      from: string,
      to: string,
      drill: DrillDownState
    ): Promise<void> => {
      if (workspaceId === "" || projectId === "") return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdsManagerData({
          accessToken,
          workspaceId,
          projectId,
          dateFrom: from,
          dateTo: to,
          level: drill.level,
          campaignId: drill.campaignId === "" ? undefined : drill.campaignId,
          adsetId: drill.adsetId === "" ? undefined : drill.adsetId,
        });
        setPayload(result);
      } catch (e) {
        setPayload(null);
        setError(
          e instanceof Error ? e.message : "Failed to load Ads Manager data"
        );
      } finally {
        setLoading(false);
      }
    },
    [accessToken, workspaceId, projectId]
  );

  useEffect(() => {
    void loadData(dateFrom, dateTo, drillDown);
  }, [loadData, dateFrom, dateTo, drillDown]);

  function handleDateApply(from: string, to: string): void {
    setDateFrom(from);
    setDateTo(to);
    setDrillDown(initialDrillDown());
  }

  function handleDrillDown(row: AdsManagerRow): void {
    if (drillDown.level === "campaign") {
      setDrillDown({
        level: "adset",
        campaignContext: { id: row.entity_id, name: row.entity_name },
        adsetContext: null,
        campaignId: row.entity_id,
        adsetId: "",
      });
    } else if (drillDown.level === "adset") {
      setDrillDown({
        level: "ad",
        campaignContext: drillDown.campaignContext,
        adsetContext: { id: row.entity_id, name: row.entity_name },
        campaignId: drillDown.campaignId,
        adsetId: row.entity_id,
      });
    }
  }

  function handleNavigateCampaigns(): void {
    setDrillDown(initialDrillDown());
  }

  function handleNavigateCampaign(id: string, name: string): void {
    setDrillDown({
      level: "adset",
      campaignContext: { id, name },
      adsetContext: null,
      campaignId: id,
      adsetId: "",
    });
  }

  const displayCampaignContext =
    payload?.campaign_context ?? drillDown.campaignContext;
  const displayAdsetContext =
    payload?.adset_context ?? drillDown.adsetContext;

  const noAccountLinked =
    payload !== null && !payload.has_linked_accounts && !loading;
  const noDataInRange =
    payload !== null &&
    payload.has_linked_accounts &&
    payload.rows.length === 0 &&
    !loading;

  const rows: AdsManagerRow[] = payload?.rows ?? [];
  const summary = payload?.summary ?? null;
  const currency = payload?.summary.currency ?? "USD";

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ads Manager</h1>
          <p className="mt-1 text-sm text-slate-500">
            Meta Ads performance — campaign, ad set, and ad level.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onApply={handleDateApply}
          />
          <SyncButton
            accessToken={accessToken}
            workspaceId={workspaceId}
            projectId={projectId}
            onSyncComplete={() => void loadData(dateFrom, dateTo, drillDown)}
          />
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error !== null && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ───────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <RefreshCw size={14} className="animate-spin" />
          Loading…
        </div>
      )}

      {/* ── No account linked ─────────────────────────────────────────────── */}
      {noAccountLinked && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
            <Settings size={24} className="text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            No Meta Ads account connected
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-xs">
            Connect your Meta Business account from Project Settings to start
            syncing campaign data.
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-800 underline"
          >
            Go to Project Settings →
          </Link>
        </div>
      )}

      {/* ── No data for range ─────────────────────────────────────────────── */}
      {noDataInRange && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <TrendingUp size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            No spend data for this date range
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-xs">
            Try expanding to &ldquo;Last 90 days&rdquo; or click &ldquo;Sync
            Now&rdquo; to pull the latest data from Meta.
          </p>
        </div>
      )}

      {/* ── Summary KPIs ──────────────────────────────────────────────────── */}
      {summary !== null && !loading && rows.length > 0 && (
        <SummaryBar summary={summary} />
      )}

      {/* ── Breadcrumb + Table ───────────────────────────────────────────── */}
      {rows.length > 0 && !loading && (
        <div className="flex flex-col gap-3">
          <Breadcrumb
            level={drillDown.level}
            campaignContext={displayCampaignContext}
            adsetContext={displayAdsetContext}
            onNavigateCampaigns={handleNavigateCampaigns}
            onNavigateCampaign={handleNavigateCampaign}
          />

          <EntityTable
            rows={rows}
            level={drillDown.level}
            currency={currency}
            onDrillDown={handleDrillDown}
          />

          <p className="text-xs text-slate-400 text-right">
            {`${rows.length} row${rows.length === 1 ? "" : "s"} · ${dateFrom} → ${dateTo}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export function AdsManagerDashboardPage(): React.ReactElement {
  return (
    <DashboardShell>
      {(ctx) => <AdsManagerContent ctx={ctx} />}
    </DashboardShell>
  );
}
