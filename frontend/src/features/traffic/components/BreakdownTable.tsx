import type { TrafficRunColumn, TrafficSectionPayload } from "../types";

function formatPct(v: number | null): string {
  if (v === null || Number.isNaN(v)) {
    return "-";
  }
  return `${v.toFixed(2)}%`;
}

export function BreakdownTable(props: {
  title: string;
  runs: TrafficRunColumn[];
  section: TrafficSectionPayload;
}): React.ReactElement {
  const { title, runs, section } = props;
  const hasUnassigned = (section.runColumnTotals.__unassigned__ ?? 0) > 0;

  return (
    <section>
      <h2>{title}</h2>
      <p className="muted">Section total leads: {section.grandTotal}</p>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>% of section</th>
            <th>Total</th>
            {runs.map((run) => (
              <th key={run.id}>{run.display_label}</th>
            ))}
            {hasUnassigned ? <th>Unassigned run</th> : null}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{formatPct(row.pctOfSection)}</td>
              <td>{row.total}</td>
              {runs.map((run) => (
                <td key={run.id}>
                  {row.countsByRunId[run.id] ?? 0}
                  <br />
                  <span className="muted">
                    {formatPct(row.pctOfRunColumn[run.id] ?? null)}
                  </span>
                </td>
              ))}
              {hasUnassigned ? (
                <td>
                  {row.countsByRunId.__unassigned__ ?? 0}
                  <br />
                  <span className="muted">
                    {formatPct(row.pctOfRunColumn.__unassigned__ ?? null)}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
