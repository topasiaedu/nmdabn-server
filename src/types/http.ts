/**
 * Standard JSON error shape returned by API Route Handlers.
 */
export type ApiErrorJson = {
  success: false;
  error: string;
};

/**
 * Failed guard result for async route helpers (before building NextResponse).
 */
export type GuardFailure = {
  ok: false;
  status: number;
  body: ApiErrorJson;
};
