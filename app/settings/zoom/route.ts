import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.redirect(new URL("/settings/integrations?tab=zoom", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
}
