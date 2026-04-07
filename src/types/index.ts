import type { Database } from "../database.types";

// Database table types
export type IntegrationAccount = Database['public']['Tables']['integration_accounts']['Row'];
export type IntegrationAccountInsert = Database['public']['Tables']['integration_accounts']['Insert'];
export type IntegrationAccountUpdate = Database['public']['Tables']['integration_accounts']['Update'];

export type IntegrationJob = Database['public']['Tables']['integration_jobs']['Row'];
export type IntegrationJobInsert = Database['public']['Tables']['integration_jobs']['Insert'];
export type IntegrationJobUpdate = Database['public']['Tables']['integration_jobs']['Update'];

export type User = Database['public']['Tables']['users']['Row'];
export type Workspace = Database['public']['Tables']['workspaces']['Row'];
export type WorkspaceMember = Database['public']['Tables']['workspace_members']['Row'];

// Enums
export type IntegrationProvider = Database['public']['Enums']['integration_provider'];
export type IntegrationJobStatus = Database['public']['Enums']['integration_job_status'];

// Request types with authenticated user context
export interface AuthenticatedRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
  };
  workspaceId?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Job payload types for different operations
export interface GoogleSheetsAppendRowPayload {
  spreadsheetId: string;
  sheetName?: string;
  values: unknown[][];
}

export interface GoogleSheetsSyncSheetPayload {
  spreadsheetId: string;
  sheetName?: string;
  syncType: string;
  mappingConfig?: Record<string, unknown>;
}

export interface VapiCreateCallPayload {
  phoneNumber: string;
  assistantId?: string;
  metadata?: Record<string, unknown>;
}

export interface VapiSyncCallLogPayload {
  callId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ZoomCreateMeetingPayload {
  topic: string;
  startTime: string;
  duration: number;
  settings?: Record<string, unknown>;
}

export interface ZoomAddRegistrantPayload {
  meetingId?: string;
  webinarId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  customQuestions?: Record<string, unknown>;
}

export interface ZoomSyncMeetingPayload {
  meetingId: string;
}

