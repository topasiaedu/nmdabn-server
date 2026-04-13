import { Router, Response } from "express";
import { supabase } from "../config/supabase";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types";

const router = Router();

/**
 * GET /api/workspaces
 * List workspaces current user can access.
 */
router.get(
  "/",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (typeof userId !== "string" || userId.trim() === "") {
        res.status(401).json({ success: false, error: "User not authenticated" });
        return;
      }

      const { data: memberships, error } = await supabase
        .from("workspace_members")
        .select("role, workspaces(id, name)")
        .eq("user_id", userId);

      if (error) {
        res
          .status(500)
          .json({ success: false, error: `Failed to fetch workspaces: ${error.message}` });
        return;
      }

      const rows = (memberships ?? [])
        .map((m) => {
          const ws = m.workspaces;
          if (ws === null || Array.isArray(ws)) {
            return null;
          }
          return {
            id: ws.id,
            name: ws.name,
            role: m.role,
          };
        })
        .filter((v): v is { id: string; name: string; role: string } => v !== null);

      res.json({ success: true, data: rows });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;

