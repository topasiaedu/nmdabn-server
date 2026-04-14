"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashboardContext } from "@/components/DashboardContext";
import { fetchAgencyStats } from "./services/api";
import type { AgencyRow } from "./types";

function formatPercent(rate: number | null): string {
  if (rate === null) {
    return "—";
  }
  return `${(rate * 100).toFixed(1)}%`;
}

function formatNullableNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return String(value);
}

function AgencyContent(props: { ctx: DashboardContext }): React.ReactElement {
  const { ctx } = props;
  const { accessToken, workspaceId, projectId, webinarRunId, dateFrom, dateTo } =
    ctx;

  const [rows, setRows] = useState<AgencyRow[]>([]);
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
      const result = await fetchAgencyStats(
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
          : "Failed to load agency stats."
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

  return (
    <div>
      <h1>Agency</h1>
      {loading ? <p className="muted">Loading...</p> : null}
      {error !== null ? <p className="error">{error}</p> : null}
      {webinarRunId === "" ? (
        <p className="muted">Select a webinar run to load stats.</p>
      ) : null}
      {!loading && error === null && rows.length === 0 && webinarRunId !== "" ? (
        <p className="muted">No data.</p>
      ) : null}
      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Leads</th>
              <th>Showed</th>
              <th>Show-up %</th>
              <th>Buyers</th>
              <th>Conversion %</th>
              <th>Ad Spend</th>
              <th>CPL</th>
              <th>CPA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.agency_line}-${row.webinar_run_id}`}>
                <td>{row.agency_line}</td>
                <td>{row.leads}</td>
                <td>{row.showed}</td>
                <td>{formatPercent(row.showup_rate)}</td>
                <td>{row.buyers}</td>
                <td>{formatPercent(row.conversion_rate)}</td>
                <td>{formatNullableNumber(row.ad_spend)}</td>
                <td>{formatNullableNumber(row.cpl)}</td>
                <td>{formatNullableNumber(row.cpa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * Agency line KPIs for the selected webinar run.
 */
export function AgencyDashboardPage(): React.ReactElement {
  return (
    <DashboardShell>
      {(ctx) => <AgencyContent ctx={ctx} />}
    </DashboardShell>
  );
}
