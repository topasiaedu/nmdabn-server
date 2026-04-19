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
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
          {title}
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Section total leads: {section.grandTotal}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-4 font-semibold whitespace-nowrap">
                Label
              </th>
              <th className="px-6 py-4 font-semibold text-right whitespace-nowrap">
                % of section
              </th>
              <th className="px-6 py-4 font-semibold text-right whitespace-nowrap">
                Total
              </th>
              {runs.map((run) => (
                <th
                  key={run.id}
                  className="px-6 py-4 font-semibold text-right whitespace-nowrap"
                >
                  {run.display_label}
                </th>
              ))}
              {hasUnassigned ? (
                <th className="px-6 py-4 font-semibold text-right whitespace-nowrap text-amber-700">
                  Unassigned run
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {section.rows.map((row) => (
              <tr
                key={row.label}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                  {row.label}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatPct(row.pctOfSection)}
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {row.total}
                </td>
                {runs.map((run) => (
                  <td key={run.id} className="px-6 py-4 text-right">
                    <div>{row.countsByRunId[run.id] ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatPct(row.pctOfRunColumn[run.id] ?? null)}
                    </div>
                  </td>
                ))}
                {hasUnassigned ? (
                  <td className="px-6 py-4 text-right bg-amber-50">
                    <div className="text-amber-900">
                      {row.countsByRunId.__unassigned__ ?? 0}
                    </div>
                    <div className="text-xs text-amber-700 mt-0.5">
                      {formatPct(row.pctOfRunColumn.__unassigned__ ?? null)}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
