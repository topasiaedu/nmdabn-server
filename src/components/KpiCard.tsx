import { type ReactElement, type ReactNode } from "react";

type KpiCardProps = Readonly<{
  title: string;
  value: string | number;
  icon: ReactNode;
  badge?: string;
  badgeColor?: "green" | "red" | "amber" | "slate";
  /** Optional extra classes applied to the root card element (e.g. min-w-[140px]) */
  className?: string;
}>;

export function KpiCard({
  title,
  value,
  icon,
  badge,
  badgeColor = "green",
  className = "",
}: KpiCardProps): ReactElement {
  const badgeClasses = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[badgeColor];

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
          {icon}
        </div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
          {title}
        </h3>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className="text-2xl font-bold text-slate-900 tracking-tight truncate"
          title={String(value)}
        >
          {value}
        </span>
        {badge !== undefined && (
          <span
            className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClasses}`}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
