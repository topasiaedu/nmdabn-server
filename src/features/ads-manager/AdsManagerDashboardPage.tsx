"use client";

/**
 * Meta Ads Manager dashboard — 3-tab Meta-style layout:
 * - Campaigns | Ad Sets | Ads tabs (all loaded in parallel)
 * - Multi-select checkboxes on Campaign and Ad Set tabs for cross-tab filtering
 * - Auto on-load incremental sync when data is stale (> 30 min)
 * - Manual "Sync Now" button always fetches the full 90-day window
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
  AdsManagerLevel,
  AdsManagerPayload,
  AdsManagerRow,
  AdsManagerSummary,
} from "@/features/ads-manager/types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA").format(d);
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

function formatCurrency(amount: number, currency: string): string {
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

type DatePreset = { label: string; from: string; to: string };

function buildPresets(): DatePreset[] {
  return [
    { label: "Today", from: todayIso(), to: todayIso() },
    { label: "Yesterday", from: daysAgoIso(1), to: daysAgoIso(1) },
    { label: "Last 7 days", from: daysAgoIso(7), to: todayIso() },
    { label: "Last 14 days", from: daysAgoIso(14), to: todayIso() },
    { label: "Last 30 days", from: daysAgoIso(30), to: todayIso() },
    { label: "Last 90 days", from: daysAgoIso(90), to: todayIso() },
    { label: "This month", from: firstDayOfMonthIso(), to: todayIso() },
    {
      label: "Last month",
      from: firstDayOfLastMonthIso(),
      to: lastDayOfLastMonthIso(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Status badge helpers
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
  if (s === "DELETED" || s === "ARCHIVED") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

// ---------------------------------------------------------------------------
// Sync button + result types
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
          lookback_days: 90,
        }),
      });
      const body: unknown = await res.json();
      const isRecord = (x: unknown): x is Record<string, unknown> =>
        typeof x === "object" && x !== null && !Array.isArray(x);
      const isFailure = isRecord(body) && body["success"] === false;

      if (!res.ok || isFailure) {
        const errMsg =
          isRecord(body) && typeof body["error"] === "string"
            ? body["error"]
            : `HTTP ${res.status}`;
        setSyncError(errMsg);
      } else {
        const resultData = isRecord(body) ? (body["data"] ?? body) : body;
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
    <div className="flex flex-col gap-1.5 items-end">
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
      if (containerRef.current !== null && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => { document.removeEventListener("mousedown", handleClick); };
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
    if (activePreset !== "Custom" && activePreset !== "") return activePreset;
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
            <div className="w-40 bg-slate-50 border-r border-slate-200 p-2 flex flex-col gap-0.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                    activePreset === preset.label
                      ? "bg-blue-600 text-white font-medium"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex-1 p-4 flex flex-col gap-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Custom range</p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Start date</span>
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo === "" ? todayIso() : draftTo}
                  onChange={(e) => { setDraftFrom(e.target.value); setActivePreset("Custom"); }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">End date</span>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom === "" ? undefined : draftFrom}
                  max={todayIso()}
                  onChange={(e) => { setDraftTo(e.target.value); setActivePreset("Custom"); }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <button
                type="button"
                onClick={applyCustom}
                disabled={draftFrom === "" || draftTo === ""}
                className="mt-auto w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

type SummaryBarProps = Readonly<{ summary: AdsManagerSummary }>;

function SummaryBar({ summary }: SummaryBarProps): React.ReactElement {
  const currency = summary.currency;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-3 min-w-max">
        <KpiCard className="min-w-[150px]" title="Spend" value={formatMoney(summary.total_spend, currency)} icon={<DollarSign size={18} />} />
        <KpiCard className="min-w-[150px]" title="Impressions" value={formatNumber(summary.total_impressions)} icon={<Eye size={18} />} />
        <KpiCard className="min-w-[140px]" title="Clicks" value={formatNumber(summary.total_clicks)} icon={<MousePointerClick size={18} />} />
        <KpiCard className="min-w-[140px]" title="Reach" value={formatNumber(summary.total_reach)} icon={<Users size={18} />} />
        <KpiCard
          className="min-w-[140px]"
          title="Leads"
          value={summary.total_leads === null ? "—" : formatNumber(summary.total_leads)}
          icon={<Target size={18} />}
          badge={summary.total_leads !== null && summary.total_leads > 0 ? "Live" : undefined}
          badgeColor="green"
        />
        <KpiCard className="min-w-[150px]" title="Cost Per Result" value={summary.cost_per_lead === null ? "—" : formatMoney(summary.cost_per_lead, currency)} icon={<DollarSign size={18} />} />
        <KpiCard className="min-w-[140px]" title="Purchases" value={summary.total_purchases === null ? "—" : formatNumber(summary.total_purchases)} icon={<ShoppingCart size={18} />} />
        <KpiCard className="min-w-[150px]" title="Revenue" value={summary.total_purchase_value === null ? "—" : formatMoney(summary.total_purchase_value, currency)} icon={<DollarSign size={18} />} />
        <KpiCard
          className="min-w-[120px]"
          title="Return on Ad Spend"
          value={summary.roas === null ? "—" : `${summary.roas.toFixed(2)}x`}
          icon={<TrendingUp size={18} />}
          badge={summary.roas !== null && summary.roas >= 2 ? "Good" : undefined}
          badgeColor="green"
        />
        <KpiCard className="min-w-[130px]" title="Landing Page Views" value={summary.total_landing_page_views === null ? "—" : formatNumber(summary.total_landing_page_views)} icon={<MousePointerClick size={18} />} />
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
// Budget cell helper
// ---------------------------------------------------------------------------

type BudgetCellProps = Readonly<{
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  isCbo: boolean | null;
  currency: string;
}>;

function BudgetCell({ dailyBudget, lifetimeBudget, isCbo, currency }: BudgetCellProps): React.ReactElement {
  const activeBudget = dailyBudget ?? lifetimeBudget;
  if (activeBudget === null) return <span className="text-slate-400">—</span>;
  const budgetType = dailyBudget === null ? "lifetime" : "daily";
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium text-slate-900">{formatMoney(activeBudget, currency)}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">{budgetType}</span>
        {isCbo !== null && (
          <span className={`inline-block px-1.5 py-0 text-[10px] font-bold rounded border ${isCbo ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
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

type ColumnKey =
  | "spend" | "budget" | "impressions" | "clicks" | "reach"
  | "leads" | "cost_per_lead" | "purchases" | "purchase_value"
  | "roas" | "landing_page_views" | "ctr" | "cpm" | "cpc";

type SortKey =
  | "entity_name" | "spend" | "daily_budget" | "impressions" | "clicks"
  | "reach" | "leads" | "cost_per_lead" | "purchases" | "purchase_value"
  | "roas" | "landing_page_views" | "ctr" | "cpm" | "cpc";

type ColumnDef = Readonly<{ key: ColumnKey; label: string; sortKey: SortKey; defaultVisible: boolean; tooltip?: string }>;

const COLUMN_DEFS: ReadonlyArray<ColumnDef> = [
  { key: "spend", label: "Spend", sortKey: "spend", defaultVisible: true },
  { key: "budget", label: "Budget", sortKey: "daily_budget", defaultVisible: true },
  { key: "impressions", label: "Impressions", sortKey: "impressions", defaultVisible: true },
  { key: "clicks", label: "Clicks", sortKey: "clicks", defaultVisible: true },
  { key: "reach", label: "Reach", sortKey: "reach", defaultVisible: true },
  { key: "leads", label: "Leads", sortKey: "leads", defaultVisible: true },
  { key: "cost_per_lead", label: "Cost Per Result", sortKey: "cost_per_lead", defaultVisible: true, tooltip: "Average spend per lead result" },
  { key: "purchases", label: "Purchases", sortKey: "purchases", defaultVisible: false },
  { key: "purchase_value", label: "Revenue", sortKey: "purchase_value", defaultVisible: false },
  { key: "roas", label: "Return on Ad Spend", sortKey: "roas", defaultVisible: false },
  { key: "landing_page_views", label: "Landing Page Views", sortKey: "landing_page_views", defaultVisible: true },
  { key: "ctr", label: "Click-Through Rate", sortKey: "ctr", defaultVisible: true },
  { key: "cpm", label: "Cost Per Mille", sortKey: "cpm", defaultVisible: false },
  { key: "cpc", label: "Cost Per Click", sortKey: "cpc", defaultVisible: false },
];

const LS_COL_KEY = "nm-ads-manager-visible-cols";

function loadVisibleCols(): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(LS_COL_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = (parsed as unknown[]).filter((k): k is ColumnKey => typeof k === "string" && COLUMN_DEFS.some((d) => d.key === k));
        if (valid.length > 0) return new Set(valid);
      }
    }
  } catch {
    // localStorage unavailable
  }
  return new Set(COLUMN_DEFS.filter((d) => d.defaultVisible).map((d) => d.key));
}

function saveVisibleCols(cols: Set<ColumnKey>): void {
  try { localStorage.setItem(LS_COL_KEY, JSON.stringify([...cols])); } catch { /* ignore */ }
}

type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// EntityRow — extracted to reduce EntityTable's cognitive complexity
// ---------------------------------------------------------------------------

type EntityRowProps = Readonly<{
  row: AdsManagerRow;
  idx: number;
  isSelected: boolean;
  selectable: boolean;
  currency: string;
  visibleCols: Set<ColumnKey>;
  onToggle: (id: string) => void;
}>;

function EntityRow({ row, idx, isSelected, selectable, currency, visibleCols, onToggle }: EntityRowProps): React.ReactElement {
  function bgClass(): string {
    if (isSelected) return "bg-blue-50/60";
    return idx % 2 === 0 ? "bg-white" : "bg-slate-50/30";
  }

  return (
    <tr
      className={`transition-colors ${bgClass()} hover:bg-blue-50/30 ${selectable ? "cursor-pointer" : ""}`}
      onClick={() => { if (selectable) onToggle(row.entity_id); }}
    >
      {selectable && (
        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(row.entity_id)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className={`font-medium text-slate-900 ${isSelected ? "text-blue-700" : ""}`}>{row.entity_name}</span>
          {row.entity_label !== null && <span className="text-xs text-slate-400">{row.entity_label}</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        {row.entity_status !== null && (
          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${statusBadgeClasses(row.entity_status)}`}>
            {row.entity_status === "ADS_OFF" ? "Ads off" : row.entity_status}
          </span>
        )}
      </td>
      {visibleCols.has("spend") && <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">{formatMoney(row.spend, currency)}</td>}
      {visibleCols.has("budget") && <td className="px-4 py-3 text-right whitespace-nowrap"><BudgetCell dailyBudget={row.daily_budget} lifetimeBudget={row.lifetime_budget} isCbo={row.is_cbo} currency={currency} /></td>}
      {visibleCols.has("impressions") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{formatNumber(row.impressions)}</td>}
      {visibleCols.has("clicks") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{formatNumber(row.clicks)}</td>}
      {visibleCols.has("reach") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{formatNumber(row.reach)}</td>}
      {visibleCols.has("leads") && <td className="px-4 py-3 text-right whitespace-nowrap">{row.leads === null ? <span className="text-slate-400">—</span> : <span className="font-medium text-blue-700">{formatNumber(row.leads)}</span>}</td>}
      {visibleCols.has("cost_per_lead") && <td className="px-4 py-3 text-right whitespace-nowrap">{row.cost_per_lead === null ? <span className="text-slate-400">—</span> : <span className="font-medium text-emerald-700">{formatMoney(row.cost_per_lead, currency)}</span>}</td>}
      {visibleCols.has("purchases") && <td className="px-4 py-3 text-right whitespace-nowrap">{row.purchases === null ? <span className="text-slate-400">—</span> : <span className="font-medium text-blue-700">{formatNumber(row.purchases)}</span>}</td>}
      {visibleCols.has("purchase_value") && <td className="px-4 py-3 text-right whitespace-nowrap">{row.purchase_value === null ? <span className="text-slate-400">—</span> : <span className="font-medium text-emerald-700">{formatMoney(row.purchase_value, currency)}</span>}</td>}
      {visibleCols.has("roas") && <td className="px-4 py-3 text-right whitespace-nowrap">{row.roas === null ? <span className="text-slate-400">—</span> : <span className={`font-medium ${row.roas >= 2 ? "text-emerald-700" : "text-amber-600"}`}>{`${row.roas.toFixed(2)}x`}</span>}</td>}
      {visibleCols.has("landing_page_views") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{row.landing_page_views === null ? <span className="text-slate-400">—</span> : formatNumber(row.landing_page_views)}</td>}
      {visibleCols.has("ctr") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{formatPct(row.ctr)}</td>}
      {visibleCols.has("cpm") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{row.cpm === null ? "—" : formatMoney(row.cpm, currency)}</td>}
      {visibleCols.has("cpc") && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{row.cpc === null ? "—" : formatMoney(row.cpc, currency)}</td>}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// EntityTable — multi-select + sort + filter
// ---------------------------------------------------------------------------

type EntityTableProps = Readonly<{
  rows: AdsManagerRow[];
  level: AdsManagerLevel;
  currency: string;
  /** Slot rendered at the very top of the card — used for the tab bar. */
  tabBarSlot?: React.ReactNode;
  /** When true, shows a checkbox column and enables row selection. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (newSet: Set<string>) => void;
}>;

function EntityTable({
  rows,
  level,
  currency,
  tabBarSlot,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
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
      if (colMenuRef.current !== null && !colMenuRef.current.contains(e.target as Node)) setShowColMenu(false);
    }
    if (showColMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [showColMenu]);

  function handleSort(key: SortKey): void {
    if (sortKey === key) { setSortDir((prev) => (prev === "desc" ? "asc" : "desc")); }
    else { setSortKey(key); setSortDir("desc"); }
  }

  function toggleCol(key: ColumnKey): void {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveVisibleCols(next);
      return next;
    });
  }

  function toggleRow(id: string): void {
    if (onSelectionChange === undefined) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }

  function toggleAll(): void {
    if (onSelectionChange === undefined) return;
    const visibleIds = filtered.map((r) => r.entity_id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      const next = new Set(selectedIds);
      visibleIds.forEach((id) => next.delete(id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      visibleIds.forEach((id) => next.add(id));
      onSelectionChange(next);
    }
  }

  const filtered = rows
    .filter((row) => searchQuery === "" || row.entity_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((row) => statusFilter === "all" || (row.entity_status ?? "").toUpperCase() === statusFilter.toUpperCase());

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "desc" ? -1 : 1;
    if (sortKey === "entity_name") return mul * a.entity_name.localeCompare(b.entity_name);
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    if (typeof aVal === "number" && typeof bVal === "number") return mul * (aVal - bVal);
    return 0;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.entity_id));
  const someFilteredSelected = filtered.some((r) => selectedIds.has(r.entity_id));

  function entityLabelForLevel(): string {
    if (level === "adset") return "Ad Set";
    if (level === "ad") return "Ad";
    return "Campaign";
  }

  const entityLabel = entityLabelForLevel();

  function colHeader(label: string, key: SortKey, tooltip?: string): React.ReactElement {
    const active = sortKey === key;
    return (
      <th key={key} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-slate-700" onClick={() => handleSort(key)}>
        <span className="inline-flex items-center gap-1 justify-end">
          {label}
          {tooltip !== undefined && <span className="text-slate-400 cursor-help font-normal normal-case tracking-normal" title={tooltip}>ⓘ</span>}
          {active && <span className="text-blue-600">{sortDir === "desc" ? "↓" : "↑"}</span>}
        </span>
      </th>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Tab bar slot — injected from parent so it sits inside the card */}
      {tabBarSlot !== undefined && tabBarSlot}
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap bg-slate-50/40">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={`Search ${entityLabel.toLowerCase()}s…`}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "active", "paused", "ads_off"] as const).map((f) => (
            <button key={f} type="button" onClick={() => { setStatusFilter(f); }} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${statusFilter === f ? "bg-blue-600 text-white border-blue-600" : "text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"}`}>
              {filterPillLabel(f)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {selectable && selectedIds.size > 0 && (
          <span className="text-xs text-blue-700 font-medium bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
            {`${selectedIds.size} selected`}
          </span>
        )}
        <div className="relative" ref={colMenuRef}>
          <button type="button" onClick={() => { setShowColMenu((p) => !p); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <SlidersHorizontal size={13} />
            Columns
          </button>
          {showColMenu && (
            <div className="absolute right-0 top-9 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 pb-1.5">Visible columns</p>
              {COLUMN_DEFS.map((col) => (
                <label key={col.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => { toggleCol(col.key); }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700">{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => { if (el !== null) el.indeterminate = !allFilteredSelected && someFilteredSelected; }}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-64">{entityLabel}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              {COLUMN_DEFS.map((col) => visibleCols.has(col.key) ? colHeader(col.label, col.sortKey, col.tooltip) : null)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row, idx) => (
              <EntityRow
                key={row.entity_id}
                row={row}
                idx={idx}
                isSelected={selectedIds.has(row.entity_id)}
                selectable={selectable}
                currency={currency}
                visibleCols={visibleCols}
                onToggle={toggleRow}
              />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={2 + (selectable ? 1 : 0) + visibleCols.size} className="px-4 py-10 text-center text-sm text-slate-500">
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
// Main content component
// ---------------------------------------------------------------------------

type TabData = {
  payload: AdsManagerPayload | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_TAB: TabData = { payload: null, loading: false, error: null };

type AdsManagerContentProps = Readonly<{ ctx: DashboardContext }>;

function AdsManagerContent({ ctx }: AdsManagerContentProps): React.ReactElement {
  const { accessToken, workspaceId, projectId } = ctx;

  const [dateFrom, setDateFrom] = useState<string>(daysAgoIso(30));
  const [dateTo, setDateTo] = useState<string>(todayIso());

  // Refs mirror the date state so async callbacks (checkAndAutoSync) always
  // read the latest user-selected dates instead of a stale closure snapshot.
  const dateFromRef = useRef<string>(daysAgoIso(30));
  const dateToRef = useRef<string>(todayIso());
  useEffect(() => { dateFromRef.current = dateFrom; }, [dateFrom]);
  useEffect(() => { dateToRef.current = dateTo; }, [dateTo]);

  const [activeTab, setActiveTab] = useState<AdsManagerLevel>("campaign");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [selectedAdsetIds, setSelectedAdsetIds] = useState<Set<string>>(new Set());

  const [campaigns, setCampaigns] = useState<TabData>(EMPTY_TAB);
  const [adsets, setAdsets] = useState<TabData>(EMPTY_TAB);
  const [ads, setAds] = useState<TabData>(EMPTY_TAB);

  const [autoSyncing, setAutoSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  /** Fetches a single tab's data. */
  const loadTab = useCallback(
    async (
      level: AdsManagerLevel,
      from: string,
      to: string,
      campaignIds: string[],
      adsetIds: string[],
      setter: React.Dispatch<React.SetStateAction<TabData>>
    ): Promise<void> => {
      if (workspaceId === "" || projectId === "") return;
      setter((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await fetchAdsManagerData({
          accessToken,
          workspaceId,
          projectId,
          dateFrom: from,
          dateTo: to,
          level,
          campaignIds,
          adsetIds,
        });
        setter({ payload: result, loading: false, error: null });
      } catch (e) {
        setter({ payload: null, loading: false, error: e instanceof Error ? e.message : "Failed to load data" });
      }
    },
    [accessToken, workspaceId, projectId]
  );

  /**
   * Load all 3 tabs in parallel, respecting the current campaign/adset selections.
   * Campaigns always load without a filter; adsets filter by campaignIds; ads filter
   * by adsetIds (or show all when both are empty).
   */
  const loadAllTabs = useCallback(
    (
      from: string,
      to: string,
      campaignIds: string[] = [],
      adsetIds: string[] = []
    ): void => {
      void loadTab("campaign", from, to, [], [], setCampaigns);
      void loadTab("adset", from, to, campaignIds, [], setAdsets);
      void loadTab("ad", from, to, [], adsetIds, setAds);
    },
    [loadTab]
  );

  /** Check sync status and trigger an auto-sync if data is stale (> 30 min). */
  const checkAndAutoSync = useCallback(async (): Promise<void> => {
    if (workspaceId === "" || projectId === "") return;
    try {
      const qs = new URLSearchParams({ workspace_id: workspaceId, project_id: projectId });
      const res = await fetch(`/api/dashboard/ads-manager/sync-status?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const body: unknown = await res.json();
      if (typeof body !== "object" || body === null) return;
      const data = body as Record<string, unknown>;
      const rawLastSynced = data["last_synced_at"];

      // Show the existing last-synced time even when no sync is needed.
      if (typeof rawLastSynced === "string") {
        setLastSyncedAt(new Date(rawLastSynced));
      }

      // Determine staleness and compute an appropriate lookback window.
      let needsSync = false;
      let lookbackDays = 3;

      if (rawLastSynced === null || rawLastSynced === undefined) {
        needsSync = true;
        lookbackDays = 90;
      } else if (typeof rawLastSynced === "string") {
        const ageMs = Date.now() - new Date(rawLastSynced).getTime();
        const ageMinutes = ageMs / 60_000;
        if (ageMinutes > 30) {
          needsSync = true;
          const ageDays = Math.ceil(ageMs / (24 * 60 * 60 * 1000));
          lookbackDays = Math.min(90, ageDays + 2);
        }
      }

      if (!needsSync) return;

      setAutoSyncing(true);
      try {
        await fetch("/api/actions/sync/meta-ads", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            project_id: projectId,
            lookback_days: lookbackDays,
          }),
        });
        // Use refs so we reload with the user's *current* date selection,
        // not the stale closure values from when this effect was mounted.
        loadAllTabs(dateFromRef.current, dateToRef.current);
        setLastSyncedAt(new Date());
      } finally {
        setAutoSyncing(false);
      }
    } catch {
      // Auto-sync is best-effort; silent failure is acceptable
    }
  }, [accessToken, workspaceId, projectId, loadAllTabs]);

  // On mount: load data + check sync status in parallel.
  useEffect(() => {
    loadAllTabs(dateFrom, dateTo);
    void checkAndAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload all tabs when date range changes; preserve existing selections so the
  // marketer doesn't have to re-select campaigns/adsets after adjusting the date.
  function handleDateApply(from: string, to: string): void {
    setDateFrom(from);
    setDateTo(to);
    loadAllTabs(from, to, [...selectedCampaignIds], [...selectedAdsetIds]);
  }

  // When campaign selection changes, re-fetch adsets (filtered) and ads (unfiltered).
  useEffect(() => {
    const ids = [...selectedCampaignIds];
    void loadTab("adset", dateFrom, dateTo, ids, [], setAdsets);
    void loadTab("ad", dateFrom, dateTo, [], [], setAds);
    setSelectedAdsetIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignIds]);

  // When adset selection changes, re-fetch ads (filtered).
  useEffect(() => {
    const ids = [...selectedAdsetIds];
    void loadTab("ad", dateFrom, dateTo, [], ids, setAds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAdsetIds]);

  function handleSyncComplete(): void {
    loadAllTabs(dateFrom, dateTo, [...selectedCampaignIds], [...selectedAdsetIds]);
    setLastSyncedAt(new Date());
  }

  /** Pluralised filter badge shown on a tab when entities are selected in a parent tab. */
  function selectionBadge(count: number, singular: string, plural: string): string | undefined {
    if (count === 0) return undefined;
    return `${count} ${count === 1 ? singular : plural} selected`;
  }

  /** Returns the data state for a given tab level. */
  function tabDataForLevel(lvl: AdsManagerLevel): TabData {
    if (lvl === "campaign") return campaigns;
    if (lvl === "adset") return adsets;
    return ads;
  }

  /** Returns the selected IDs Set for the currently active tab (undefined for Ads). */
  function activeSelectedIds(): Set<string> | undefined {
    if (activeTab === "campaign") return selectedCampaignIds;
    if (activeTab === "adset") return selectedAdsetIds;
    return undefined;
  }

  /** Returns the selection change handler for the currently active tab (undefined for Ads). */
  function activeOnSelectionChange(): ((ids: Set<string>) => void) | undefined {
    if (activeTab === "campaign") return setSelectedCampaignIds;
    if (activeTab === "adset") return setSelectedAdsetIds;
    return undefined;
  }

  const tabDef: Array<{ level: AdsManagerLevel; label: string; badge?: string }> = [
    { level: "campaign", label: "Campaigns", badge: undefined },
    {
      level: "adset",
      label: "Ad Sets",
      badge: selectionBadge(selectedCampaignIds.size, "campaign", "campaigns"),
    },
    {
      level: "ad",
      label: "Ads",
      badge: selectionBadge(selectedAdsetIds.size, "ad set", "ad sets"),
    },
  ];

  const activeData = tabDataForLevel(activeTab);
  const currency = activeData.payload?.summary.currency ?? "USD";
  const rows: AdsManagerRow[] = activeData.payload?.rows ?? [];
  const summary = activeData.payload?.summary ?? null;

  const noAccountLinked = activeData.payload !== null && !activeData.payload.has_linked_accounts && !activeData.loading;
  const noDataInRange = activeData.payload !== null && activeData.payload.has_linked_accounts && rows.length === 0 && !activeData.loading;

  /** Tab bar rendered inside the table card so it looks like Meta Ads Manager. */
  function renderTabBar(): React.ReactElement {
    return (
      <div className="flex items-center gap-0 border-b border-slate-200 px-2 bg-white">
        {tabDef.map((tab) => {
          const tabData = tabDataForLevel(tab.level);
          return (
            <button
              key={tab.level}
              type="button"
              onClick={() => setActiveTab(tab.level)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.level
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 whitespace-nowrap border border-blue-100">
                  {tab.badge}
                </span>
              )}
              {tabData.loading && (
                <RefreshCw size={11} className="animate-spin text-slate-400" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f0f2f5]">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: title + auto-sync badge */}
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ads Manager</h1>
              <p className="text-xs text-slate-500 mt-0.5">Meta Ads performance — campaigns, ad sets, and ads</p>
            </div>
            {autoSyncing && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                <RefreshCw size={11} className="animate-spin" />
                Updating…
              </span>
            )}
          </div>

          {/* Right: last synced + date picker + sync button */}
          <div className="flex items-center gap-3 flex-wrap">
            {lastSyncedAt !== null && (
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {`Data as of ${lastSyncedAt.toLocaleDateString([], { month: "short", day: "numeric" })} ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            )}
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onApply={handleDateApply} />
            <SyncButton accessToken={accessToken} workspaceId={workspaceId} projectId={projectId} onSyncComplete={handleSyncComplete} />
          </div>
        </div>
      </div>

      {/* ── Page body ───────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 flex flex-col gap-4">
        {/* Summary KPIs — always show for the active tab when data is available */}
        {summary !== null && rows.length > 0 && (
          <SummaryBar summary={summary} />
        )}

        {/* Error banner */}
        {activeData.error !== null && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {activeData.error}
          </div>
        )}

        {/* No account linked */}
        {noAccountLinked && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Settings size={24} className="text-blue-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">No Meta Ads account connected</p>
            <p className="mt-1 text-xs text-slate-500 max-w-xs">Connect your Meta Business account from Project Settings to start syncing campaign data.</p>
            <Link href="/settings" className="mt-4 inline-block text-xs font-medium text-blue-600 hover:text-blue-800 underline">
              Go to Project Settings →
            </Link>
          </div>
        )}

        {/* No data in range — shown inside the table card so tabs are still accessible */}
        {!noAccountLinked && (
          <div className="flex flex-col gap-0">
            {/* Loading skeleton (initial load with no cached rows) */}
            {activeData.loading && rows.length === 0 && (
              <div className="bg-white rounded-t-xl border border-slate-200 shadow-sm">
                {renderTabBar()}
                <div className="flex items-center gap-2 text-sm text-slate-500 px-6 py-10 justify-center">
                  <RefreshCw size={14} className="animate-spin text-blue-500" />
                  Loading…
                </div>
              </div>
            )}

            {/* No data for range — show inside card with tabs */}
            {noDataInRange && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {renderTabBar()}
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <TrendingUp size={24} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">No spend data for this date range</p>
                  <p className="mt-1 text-xs text-slate-500 max-w-xs">
                    Try expanding to &ldquo;Last 90 days&rdquo; or click &ldquo;Sync Now&rdquo; to pull the latest data from Meta.
                  </p>
                </div>
              </div>
            )}

            {/* Table with tabs on top */}
            {rows.length > 0 && (
              <>
                <EntityTable
                  rows={rows}
                  level={activeTab}
                  currency={currency}
                  tabBarSlot={renderTabBar()}
                  selectable={activeTab !== "ad"}
                  selectedIds={activeSelectedIds()}
                  onSelectionChange={activeOnSelectionChange()}
                />
                <p className="text-xs text-slate-400 text-right mt-1">
                  {`${rows.length} row${rows.length === 1 ? "" : "s"} · ${dateFrom} → ${dateTo}`}
                </p>
              </>
            )}
          </div>
        )}
      </div>
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
