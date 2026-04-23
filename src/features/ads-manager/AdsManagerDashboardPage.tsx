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
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
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

function filterPillLabel(f: "all" | "active" | "paused" | "ads_off"): string {
  if (f === "all") return "All";
  if (f === "ads_off") return "Ads off";
  return `${f.charAt(0).toUpperCase()}${f.slice(1)}`;
}

function statusBadgeClasses(status: string | null): string {
  const s = (status ?? "").toUpperCase();
  if (s === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "ADS_OFF") return "bg-orange-50 text-orange-700 border-orange-200";
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
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

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
        setSyncedAt(new Date());
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
      <div className="flex items-center gap-3">
        {syncedAt !== null && (
          <span className="text-xs text-slate-400">
            {`Last synced: ${syncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void handleSync(); }}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      {syncError !== null && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle size={12} />
          {syncError}
        </div>
      )}

      {syncResult !== null && (
        <div className="flex flex-col gap-1 items-end">
          <span className="text-xs text-emerald-600 font-medium">
            {`${syncResult.campaignsUpserted} campaigns · ${syncResult.adsetsUpserted} ad sets · ${syncResult.adsUpserted} ads synced`}
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
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-3 min-w-max">
        <KpiCard
          className="min-w-[150px]"
          title="Spend"
          value={formatMoney(summary.total_spend, currency)}
          icon={<DollarSign size={18} />}
        />
        <KpiCard
          className="min-w-[150px]"
          title="Impressions"
          value={formatNumber(summary.total_impressions)}
          icon={<Eye size={18} />}
        />
        <KpiCard
          className="min-w-[140px]"
          title="Clicks"
          value={formatNumber(summary.total_clicks)}
          icon={<MousePointerClick size={18} />}
        />
        <KpiCard
          className="min-w-[140px]"
          title="Reach"
          value={formatNumber(summary.total_reach)}
          icon={<Users size={18} />}
        />
        <KpiCard
          className="min-w-[140px]"
          title="Leads"
          value={summary.total_leads === null ? "—" : formatNumber(summary.total_leads)}
          icon={<Target size={18} />}
          badge={summary.total_leads !== null && summary.total_leads > 0 ? "Live" : undefined}
          badgeColor="green"
        />
        <KpiCard
          className="min-w-[150px]"
          title="Cost Per Result"
          value={summary.cost_per_lead === null ? "—" : formatMoney(summary.cost_per_lead, currency)}
          icon={<DollarSign size={18} />}
        />
        <KpiCard
          className="min-w-[140px]"
          title="Purchases"
          value={summary.total_purchases === null ? "—" : formatNumber(summary.total_purchases)}
          icon={<ShoppingCart size={18} />}
        />
        <KpiCard
          className="min-w-[150px]"
          title="Revenue"
          value={summary.total_purchase_value === null ? "—" : formatMoney(summary.total_purchase_value, currency)}
          icon={<DollarSign size={18} />}
        />
        <KpiCard
          className="min-w-[120px]"
          title="Return on Ad Spend"
          value={summary.roas === null ? "—" : `${summary.roas.toFixed(2)}x`}
          icon={<TrendingUp size={18} />}
          badge={summary.roas !== null && summary.roas >= 2 ? "Good" : undefined}
          badgeColor="green"
        />
        <KpiCard
          className="min-w-[130px]"
          title="Landing Page Views"
          value={summary.total_landing_page_views === null ? "—" : formatNumber(summary.total_landing_page_views)}
          icon={<MousePointerClick size={18} />}
        />
        <KpiCard
          className="min-w-[120px]"
          title="Click-Through Rate"
          value={formatPct(summary.ctr)}
          icon={<TrendingUp size={18} />}
          badge={summary.ctr !== null && summary.ctr >= 2 ? "Good" : undefined}
          badgeColor="green"
        />
      </div>
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
// Budget cell helper
// ---------------------------------------------------------------------------

type BudgetCellProps = Readonly<{
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  isCbo: boolean | null;
  currency: string;
}>;

function BudgetCell({
  dailyBudget,
  lifetimeBudget,
  isCbo,
  currency,
}: BudgetCellProps): React.ReactElement {
  const activeBudget = dailyBudget ?? lifetimeBudget;
  if (activeBudget === null) {
    return <span className="text-slate-400">—</span>;
  }

  const budgetType = dailyBudget === null ? "lifetime" : "daily";
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium text-slate-900">
        {formatMoney(activeBudget, currency)}
      </span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">{budgetType}</span>
        {isCbo !== null && (
          <span
            className={`inline-block px-1.5 py-0 text-[10px] font-bold rounded border ${
              isCbo
                ? "bg-violet-50 text-violet-700 border-violet-200"
                : "bg-sky-50 text-sky-700 border-sky-200"
            }`}
          >
            {isCbo ? "CBO" : "ABO"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column definitions and persistence
// ---------------------------------------------------------------------------

/** Identifies each optional data column in the table. */
type ColumnKey =
  | "spend"
  | "budget"
  | "impressions"
  | "clicks"
  | "reach"
  | "leads"
  | "cost_per_lead"
  | "purchases"
  | "purchase_value"
  | "roas"
  | "landing_page_views"
  | "ctr"
  | "cpm"
  | "cpc";

type ColumnDef = Readonly<{
  key: ColumnKey;
  label: string;
  sortKey: SortKey;
  defaultVisible: boolean;
  tooltip?: string;
}>;

const COLUMN_DEFS: ReadonlyArray<ColumnDef> = [
  { key: "spend", label: "Spend", sortKey: "spend", defaultVisible: true },
  { key: "budget", label: "Budget", sortKey: "daily_budget", defaultVisible: true },
  { key: "impressions", label: "Impressions", sortKey: "impressions", defaultVisible: true },
  { key: "clicks", label: "Clicks", sortKey: "clicks", defaultVisible: true },
  { key: "reach", label: "Reach", sortKey: "reach", defaultVisible: true },
  { key: "leads", label: "Leads", sortKey: "leads", defaultVisible: true },
  {
    key: "cost_per_lead",
    label: "Cost Per Result",
    sortKey: "cost_per_lead",
    defaultVisible: true,
    tooltip: "Cost Per Result — the average amount spent to get one lead result",
  },
  { key: "purchases", label: "Purchases", sortKey: "purchases", defaultVisible: false },
  { key: "purchase_value", label: "Revenue", sortKey: "purchase_value", defaultVisible: false },
  { key: "roas", label: "Return on Ad Spend", sortKey: "roas", defaultVisible: false },
  { key: "landing_page_views", label: "Landing Page Views", sortKey: "landing_page_views", defaultVisible: true },
  { key: "ctr", label: "Click-Through Rate", sortKey: "ctr", defaultVisible: true },
  { key: "cpm", label: "Cost Per Mille", sortKey: "cpm", defaultVisible: false },
  { key: "cpc", label: "Cost Per Click", sortKey: "cpc", defaultVisible: false },
];

const LS_COL_KEY = "nm-ads-manager-visible-cols";

/** Load visible column set from localStorage, falling back to defaults. */
function loadVisibleCols(): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(LS_COL_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = (parsed as unknown[]).filter((k): k is ColumnKey => {
          if (typeof k !== "string") return false;
          return COLUMN_DEFS.some((d) => d.key === k);
        });
        if (valid.length > 0) return new Set(valid);
      }
    }
  } catch {
    // localStorage unavailable or corrupt JSON — use defaults
  }
  return new Set(COLUMN_DEFS.filter((d) => d.defaultVisible).map((d) => d.key));
}

/** Persist visible columns to localStorage. */
function saveVisibleCols(cols: Set<ColumnKey>): void {
  try {
    localStorage.setItem(LS_COL_KEY, JSON.stringify([...cols]));
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Entity table
// ---------------------------------------------------------------------------

type SortKey =
  | "entity_name"
  | "spend"
  | "daily_budget"
  | "impressions"
  | "clicks"
  | "reach"
  | "leads"
  | "cost_per_lead"
  | "purchases"
  | "purchase_value"
  | "roas"
  | "landing_page_views"
  | "ctr"
  | "cpm"
  | "cpc";

type SortDir = "asc" | "desc";

function columnHeader(
  label: string,
  key: SortKey,
  sortKey: SortKey,
  sortDir: SortDir,
  onSort: (k: SortKey) => void,
  tooltip?: string
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
        {tooltip !== undefined && (
          <span
            className="text-slate-400 cursor-help font-normal normal-case tracking-normal"
            title={tooltip}
          >
            ⓘ
          </span>
        )}
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "ads_off">("all");
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(loadVisibleCols);
  const [showColMenu, setShowColMenu] = useState<boolean>(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (
        colMenuRef.current !== null &&
        !colMenuRef.current.contains(e.target as Node)
      ) {
        setShowColMenu(false);
      }
    }
    if (showColMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColMenu]);

  function handleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function isVisible(key: ColumnKey): boolean {
    return visibleCols.has(key);
  }

  function toggleCol(key: ColumnKey): void {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveVisibleCols(next);
      return next;
    });
  }

  const filtered = rows
    .filter(
      (row) =>
        searchQuery === "" ||
        row.entity_name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(
      (row) =>
        statusFilter === "all" ||
        (row.entity_status ?? "").toUpperCase() === statusFilter.toUpperCase()
    );

  const sorted = [...filtered].sort((a, b) => {
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

      {/* ── Toolbar: search · status filters · columns toggle ─────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder={`Search ${entityLabel.toLowerCase()}s…`}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1">
          {(["all", "active", "paused", "ads_off"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setStatusFilter(f); }}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === f
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {filterPillLabel(f)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Columns customization */}
        <div className="relative" ref={colMenuRef}>
          <button
            type="button"
            onClick={() => { setShowColMenu((p) => !p); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <SlidersHorizontal size={13} />
            Columns
          </button>
          {showColMenu && (
            <div className="absolute right-0 top-9 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 pb-1.5">
                Visible columns
              </p>
              {COLUMN_DEFS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onChange={() => { toggleCol(col.key); }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700">{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
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
              {COLUMN_DEFS.map((col) =>
                isVisible(col.key)
                  ? columnHeader(col.label, col.sortKey, sortKey, sortDir, handleSort, col.tooltip)
                  : null
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, idx) => (
              <tr
                key={row.entity_id}
                className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-indigo-50/30 ${canDrillDown ? "cursor-pointer" : ""}`}
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
                      {row.entity_status === "ADS_OFF" ? "Ads off" : row.entity_status}
                    </span>
                  )}
                </td>
                {isVisible("spend") && (
                  <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                    {formatMoney(row.spend, currency)}
                  </td>
                )}
                {isVisible("budget") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <BudgetCell
                      dailyBudget={row.daily_budget}
                      lifetimeBudget={row.lifetime_budget}
                      isCbo={row.is_cbo}
                      currency={currency}
                    />
                  </td>
                )}
                {isVisible("impressions") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {formatNumber(row.impressions)}
                  </td>
                )}
                {isVisible("clicks") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {formatNumber(row.clicks)}
                  </td>
                )}
                {isVisible("reach") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {formatNumber(row.reach)}
                  </td>
                )}
                {isVisible("leads") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.leads === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-medium text-indigo-700">
                        {formatNumber(row.leads)}
                      </span>
                    )}
                  </td>
                )}
                {isVisible("cost_per_lead") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.cost_per_lead === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-medium text-emerald-700">
                        {formatMoney(row.cost_per_lead, currency)}
                      </span>
                    )}
                  </td>
                )}
                {isVisible("purchases") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.purchases === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-medium text-indigo-700">
                        {formatNumber(row.purchases)}
                      </span>
                    )}
                  </td>
                )}
                {isVisible("purchase_value") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.purchase_value === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-medium text-emerald-700">
                        {formatMoney(row.purchase_value, currency)}
                      </span>
                    )}
                  </td>
                )}
                {isVisible("roas") && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.roas === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={`font-medium ${row.roas >= 2 ? "text-emerald-700" : "text-amber-600"}`}>
                        {`${row.roas.toFixed(2)}x`}
                      </span>
                    )}
                  </td>
                )}
                {isVisible("landing_page_views") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {row.landing_page_views === null ? (
                      <span className="text-slate-400">—</span>
                    ) : formatNumber(row.landing_page_views)}
                  </td>
                )}
                {isVisible("ctr") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {formatPct(row.ctr)}
                  </td>
                )}
                {isVisible("cpm") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {row.cpm === null ? "—" : formatMoney(row.cpm, currency)}
                  </td>
                )}
                {isVisible("cpc") && (
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                    {row.cpc === null ? "—" : formatMoney(row.cpc, currency)}
                  </td>
                )}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={2 + visibleCols.size}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No results match your search or filter.
                </td>
              </tr>
            )}
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
