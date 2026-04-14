"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashboardContext } from "@/components/DashboardContext";
import { fetchShowUpStats } from "./services/api";
import type { ShowUpRow } from "./types";

function lineLabel(bucket: string): string {
  if (bucket === "NM" || bucket === "OM" || bucket === "MISSING") {
    return bucket;
  }
  return bucket;
}

function formatRate(rate: number | null): string {
  if (rate === null) {
    return "—";
  }
  return `${(rate * 100).toFixed(1)}%`;
}

function ShowUpContent(props: { ctx: DashboardContext }): React.ReactElement {
  const { ctx } = props;
  const { accessToken, workspaceId, projectId, webinarRunId, dateFrom, dateTo } =
    ctx;

  const [rows, setRows] = useState<ShowUpRow[]>([]);
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
      const result = await fetchShowUpStats(
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
          : "Failed to load show-up stats."
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
      <h1>Show Up</h1>
      {loading ? <p className="muted">Loading...</p> : null}
      {error !== null ? <p className="error">{error}</p> : null}
      {!loading && error === null && rows.length === 0 && webinarRunId !== "" ? (
        <p className="muted">No data.</p>
      ) : null}
      {webinarRunId === "" ? (
        <p className="muted">Select a webinar run to load stats.</p>
      ) : null}
      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Leads</th>
              <th>Showed</th>
              <th>Show-up %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line_bucket}>
                <td>{lineLabel(row.line_bucket)}</td>
                <td>{row.denominator}</td>
                <td>{row.numerator}</td>
                <td>{formatRate(row.showup_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * NM / OM / MISSING show-up rates per webinar run.
 */
export function ShowUpDashboardPage(): React.ReactElement {
  return (
    <DashboardShell>
      {(ctx) => <ShowUpContent ctx={ctx} />}
    </DashboardShell>
  );
}
