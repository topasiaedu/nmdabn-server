"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashboardContext } from "@/components/DashboardContext";
import { ColumnTable } from "@/components/ColumnTable";
import type { AllRunsPayload } from "@/lib/all-runs-pivot";

function buildDashboardAuthHeaders(
  token: string
): Record<string, string> {
  if (token.trim() === "") return {};
  return { Authorization: `Bearer ${token}` };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function fetchBuyerBehaviorAllRuns(
  accessToken: string,
  workspaceId: string,
  projectId: string
): Promise<AllRunsPayload> {
  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
  });
  const res = await fetch(`/api/dashboard/buyer-behavior?${qs.toString()}`, {
    headers: buildDashboardAuthHeaders(accessToken),
  });
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error("Invalid response");
  if (!res.ok || body.success === false) {
    throw new Error(
      typeof body.error === "string" ? body.error : `HTTP ${res.status}`
    );
  }
  return body.data as AllRunsPayload;
}

function BuyerBehaviorContent({
  ctx,
}: {
  ctx: DashboardContext;
}): React.ReactElement {
  const { accessToken, workspaceId, projectId } = ctx;

  const [payload, setPayload] = useState<AllRunsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const canLoad = workspaceId !== "" && projectId !== "";

  const load = useCallback(async (): Promise<void> => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBuyerBehaviorAllRuns(
        accessToken,
        workspaceId,
        projectId
      );
      setPayload(result);
    } catch (err) {
      setPayload(null);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load buyer behavior stats."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId, projectId, canLoad]);

  useEffect(() => {
    if (canLoad) void load();
  }, [canLoad, load]);

  const isEmpty =
    payload !== null &&
    payload.sections.every((s) => s.rows.length === 0);

  return (
    <div className="mx-6 mt-6 max-w-7xl pb-16">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">
        Buyer Behavior
      </h1>

      {loading && <p className="text-sm text-slate-500 mb-4">Loading…</p>}
      {error !== null && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-6">
            <ShoppingCart size={32} className="text-indigo-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            No buyer data found
          </h2>
          <p className="text-sm text-slate-500 max-w-md">
            Orders and invoices haven&apos;t been synced from GoHighLevel yet,
            or no buyers matched the criteria for this project.
          </p>
        </div>
      ) : payload !== null ? (
        <ColumnTable
          columns={payload.columns}
          sections={payload.sections}
          showPercentToggle
        />
      ) : null}
    </div>
  );
}

/** Buyer behavior sections across all webinar runs as column table. */
export function BuyerBehaviorDashboardPage(): React.ReactElement {
  useEffect(() => {
    document.title = "Buyer Behavior — NM Media";
  }, []);

  return (
    <DashboardShell>
      {(ctx) => <BuyerBehaviorContent ctx={ctx} />}
    </DashboardShell>
  );
}
