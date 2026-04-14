"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashboardContext } from "@/components/DashboardContext";
import { fetchBuyerBehaviorStats } from "./services/api";
import type { BuyerBehaviorRow } from "./types";

/**
 * Groups rows by section and sorts by sort_key within each section.
 */
function groupBySection(rows: BuyerBehaviorRow[]): Map<string, BuyerBehaviorRow[]> {
  const map = new Map<string, BuyerBehaviorRow[]>();
  for (const row of rows) {
    const existing = map.get(row.section);
    if (existing === undefined) {
      map.set(row.section, [row]);
    } else {
      existing.push(row);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sort_key - b.sort_key);
  }
  return map;
}

function formatPct(pct: number | null): string {
  if (pct === null) {
    return "—";
  }
  return `${(pct * 100).toFixed(1)}%`;
}

function formatNumeric(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return String(value);
}

function BuyerBehaviorContent(props: {
  ctx: DashboardContext;
}): React.ReactElement {
  const { ctx } = props;
  const { accessToken, workspaceId, projectId, webinarRunId, dateFrom, dateTo } =
    ctx;

  const [rows, setRows] = useState<BuyerBehaviorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    if (
      workspaceId === "" ||
      projectId === "" ||
      webinarRunId === ""
    ) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBuyerBehaviorStats(
        accessToken,
        workspaceId,
        projectId,
        webinarRunId,
        dateFrom,
        dateTo
      );
      setRows(result);
    } catch (requestError) {
      setRows([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load buyer behavior stats."
      );
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    workspaceId,
    projectId,
    webinarRunId,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => groupBySection(rows), [rows]);
  const sectionKeys = useMemo(() => [...grouped.keys()], [grouped]);

  return (
    <div>
      <h1>Buyer Behavior</h1>
      {loading ? <p className="muted">Loading...</p> : null}
      {error !== null ? <p className="error">{error}</p> : null}
      {webinarRunId === "" ? (
        <p className="muted">Select a webinar run to load stats.</p>
      ) : null}
      {!loading && error === null && rows.length === 0 && webinarRunId !== "" ? (
        <p className="muted">No data.</p>
      ) : null}
      {sectionKeys.map((section) => {
        const sectionRows = grouped.get(section);
        if (sectionRows === undefined) {
          return null;
        }
        return (
          <section key={section}>
            <h2>{section}</h2>
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Count</th>
                  <th>Numeric</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((row) => (
                  <tr key={`${row.section}-${row.label}-${row.sort_key}`}>
                    <td>{row.label}</td>
                    <td>{formatNumeric(row.bigint_val)}</td>
                    <td>{formatNumeric(row.numeric_val)}</td>
                    <td>{formatPct(row.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Buyer behavior sections for the selected webinar run.
 */
export function BuyerBehaviorDashboardPage(): React.ReactElement {
  return (
    <DashboardShell>
      {(ctx) => <BuyerBehaviorContent ctx={ctx} />}
    </DashboardShell>
  );
}
