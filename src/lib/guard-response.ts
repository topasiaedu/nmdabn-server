import { NextResponse } from "next/server";
import type { GuardFailure } from "@/types/http";

export function nextResponseFromGuard(f: GuardFailure): NextResponse {
  return NextResponse.json(f.body, { status: f.status });
}
