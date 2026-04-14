/**
 * Values passed from {@link DashboardShell} to dashboard pages via a render prop.
 */
export type DashboardContext = {
  accessToken: string;
  workspaceId: string;
  projectId: string;
  webinarRunId: string;
  dateFrom: string | null;
  dateTo: string | null;
};
