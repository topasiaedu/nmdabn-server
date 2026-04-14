export interface TrafficRunColumn {
  id: string;
  display_label: string;
}

export interface TrafficBreakdownRow {
  label: string;
  total: number;
  countsByRunId: Record<string, number>;
  pctOfSection: number | null;
  pctOfRunColumn: Record<string, number | null>;
}

export interface TrafficSectionPayload {
  grandTotal: number;
  runColumnTotals: Record<string, number>;
  rows: TrafficBreakdownRow[];
}

export interface TrafficDashboardPayload {
  line: string;
  location_id: string;
  occupation_field_id: string;
  runs: TrafficRunColumn[];
  occupation: TrafficSectionPayload;
  leadSource: TrafficSectionPayload;
  project_name?: string;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  role: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  ghl_location_id: string | null;
  traffic_occupation_field_key: string | null;
  traffic_agency_line_tags: Record<string, string[]> | null;
}

/** Minimal fields from GET /api/webinar-runs for dashboard selectors. */
export interface WebinarRunListItem {
  id: string;
  display_label: string;
  project_id: string | null;
}
