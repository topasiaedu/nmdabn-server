import type { NextRequest } from "next/server";
import { supabase } from "@/config/supabase";
import type { GuardFailure } from "@/types/http";

export type AuthSuccess = {
  ok: true;
  userId: string;
  email: string;
};

export type AuthResult = AuthSuccess | GuardFailure;

/**
 * Verifies Supabase JWT from `Authorization: Bearer` on the request.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get("authorization");
    if (
      authHeader === null ||
      !authHeader.toLowerCase().startsWith("bearer ")
    ) {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          error: "Missing or invalid authorization header",
        },
      };
    }

    const token = authHeader.slice(7).trim();
    if (token === "") {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          error: "Missing or invalid authorization header",
        },
      };
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error !== null || user === null) {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          error: "Invalid or expired token",
        },
      };
    }

    return {
      ok: true,
      userId: user.id,
      email: user.email ?? "",
    };
  } catch (e) {
    console.error("Authentication error:", e);
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        error: "Internal server error during authentication",
      },
    };
  }
}

