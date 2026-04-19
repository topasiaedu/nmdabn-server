/**
 * Values passed from {@link DashboardShell} to dashboard pages via a render prop.
 * Simplified: workspace + project only — no webinar-run or date filters.
 */
export type DashboardContext = {
  accessToken: string;
  workspaceId: string;
  /** Display name of the selected workspace. */
  workspaceName: string;
  projectId: string;
  /** Display name of the selected project. */
  projectName: string;
  /** Parsed traffic_agency_line_tags for the selected project, or null. */
  projectAgencyLineTags: Record<string, string[]> | null;
  /** Parsed traffic_breakdown_fields for the selected project, or null. */
  projectBreakdownFields: Array<{ field_key: string; label: string }> | null;
  /** GHL location id for the selected project, or null if unconfigured. */
  ghlLocationId: string | null;
};
