"use client";

import { Fragment, useState } from "react";

/** A single webinar-run column. */
export interface RunColumn {
  run_id: string;
  /** Short display label, e.g. "Mar 4". */
  label: string;
}

/** A data row inside a section. */
export interface ColumnTableRow {
  label: string;
  /** Total across all runs. */
  total: number | null;
  /** One value per run, aligned with RunColumn[]. */
  per_run: (number | null)[];
  /** When true, format values as "X%" instead of a plain number. */
  isRate?: boolean;
  /** Secondary (sub-label) style — slightly indented and lighter. */
  isSubRow?: boolean;
}

/** A named group of rows (e.g. "Lead Occupation", "Sorted Lead Source"). */
export interface ColumnTableSection {
  key: string;
  label: string;
  rows: ColumnTableRow[];
}

export interface ColumnTableProps {
  columns: RunColumn[];
  sections: ColumnTableSection[];
  /** Show a toggle button to switch values to percentages (count/total). */
  showPercentToggle?: boolean;
}

function fmt(
  value: number | null,
  isRate: boolean,
  showPct: boolean,
  sectionTotal: number | null
): string {
  if (value === null) return "—";
  if (isRate) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (showPct && sectionTotal !== null && sectionTotal > 0) {
    const pct = (value / sectionTotal) * 100;
    return `${pct.toFixed(1)}%`;
  }
  return value.toLocaleString();
}

/**
 * Scrollable column table used by all dashboard pages.
 * Sticky header row with run-date columns.
 * Section headers as full-width grey bands.
 * Bold TOTAL column.
 */
export function ColumnTable({
  columns,
  sections,
  showPercentToggle = false,
}: ColumnTableProps): React.ReactElement {
  const [showPct, setShowPct] = useState<boolean>(false);

  const hasData = sections.some((s) => s.rows.length > 0);

  if (!hasData) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        No data available yet.
      </p>
    );
  }

  return (
    <div>
      {showPercentToggle && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setShowPct((p) => !p)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              showPct
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {showPct ? "Show counts" : "Show %"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="min-w-full text-sm text-left border-collapse">
          {/* Sticky header */}
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap min-w-[180px]">
                &nbsp;
              </th>
              {/* TOTAL column */}
              <th className="px-4 py-3 font-bold text-slate-800 text-xs uppercase tracking-wide text-right whitespace-nowrap">
                Total
              </th>
              {columns.map((col) => (
                <th
                  key={col.run_id}
                  className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {sections.map((section) => (
              <Fragment key={section.key}>
                {/* Section header band */}
                <tr className="bg-slate-50">
                  <td
                    colSpan={2 + columns.length}
                    className="sticky left-0 bg-slate-50 px-5 py-2.5 font-semibold text-xs uppercase tracking-wide text-slate-500"
                  >
                    {section.label}
                  </td>
                </tr>

                {section.rows.map((row, rowIdx) => {
                  /** Section grand total (sum of non-rate, non-null totals in this section). */
                  const sectionGrandTotal = section.rows
                    .filter((r) => !r.isRate && r.total !== null)
                    .reduce((acc, r) => acc + (r.total ?? 0), 0);

                  return (
                    <tr
                      key={`${section.key}-${rowIdx}`}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        row.isSubRow ? "opacity-75" : ""
                      }`}
                    >
                      <td
                        className={`sticky left-0 bg-white px-5 py-3 text-slate-800 whitespace-nowrap ${
                          row.isSubRow ? "pl-8 text-slate-600" : "font-medium"
                        }`}
                      >
                        {row.label}
                      </td>
                      {/* TOTAL */}
                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {fmt(
                          row.total,
                          row.isRate ?? false,
                          showPct,
                          sectionGrandTotal
                        )}
                      </td>
                      {/* Per-run cells */}
                      {row.per_run.map((val, colIdx) => (
                        <td
                          key={`${section.key}-${rowIdx}-${colIdx}`}
                          className="px-4 py-3 text-right text-slate-600 tabular-nums whitespace-nowrap"
                        >
                          {fmt(
                            val,
                            row.isRate ?? false,
                            showPct,
                            sectionGrandTotal
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
