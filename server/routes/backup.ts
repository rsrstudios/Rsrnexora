import { Router } from "express";
import { authenticateSession, requireAuth } from "../middleware/authMiddleware";
import { db } from "../db/database";

export const backupRouter = Router();

backupRouter.use(authenticateSession);

// GET /api/backup/export - Export current user's data
backupRouter.get("/export", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const exportData = await db.exportUserData(userId);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="rsr_ai_backup_${Date.now()}.json"`);
    res.json(exportData);
  } catch (err) {
    next(err);
  }
});

// Handler for restoring/importing backup data
async function handleImport(req: any, res: any, next: any) {
  try {
    const userId = req.user!.userId;
    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({
        error: {
          code: "INVALID_BACKUP_FORMAT",
          message: "The uploaded backup archive is not a valid JSON object.",
        },
      });
      return;
    }

    const { conversations, memories, workspaces } = body;

    // Validate that at least one recognizable backup structure exists
    if (!Array.isArray(conversations) && !Array.isArray(memories) && !Array.isArray(workspaces)) {
      res.status(400).json({
        error: {
          code: "MALFORMED_BACKUP",
          message: "Backup must contain valid conversations, workspaces, or memories arrays.",
        },
      });
      return;
    }

    let restoredConversations = 0;
    let restoredMemories = 0;
    let restoredWorkspaces = 0;

    if (Array.isArray(workspaces)) {
      for (const ws of workspaces) {
        if (ws && typeof ws === "object" && typeof ws.name === "string" && ws.name.trim()) {
          await db.createWorkspace({
            userId,
            name: ws.name.slice(0, 60),
            description: typeof ws.description === "string" ? ws.description.slice(0, 200) : "",
            icon: typeof ws.icon === "string" ? ws.icon.slice(0, 30) : "Folder",
            customInstructions: typeof ws.customInstructions === "string" ? ws.customInstructions.slice(0, 1000) : "",
          });
          restoredWorkspaces++;
        }
      }
    }

    if (Array.isArray(conversations)) {
      for (const conv of conversations) {
        if (conv && typeof conv === "object") {
          await db.saveConversation(userId, {
            title: typeof conv.title === "string" ? conv.title.slice(0, 100) : "Restored Chat",
            messages: Array.isArray(conv.messages) ? conv.messages : [],
            workspaceId: conv.workspaceId || "default",
          });
          restoredConversations++;
        }
      }
    }

    if (Array.isArray(memories)) {
      for (const m of memories) {
        if (m && typeof m.content === "string" && m.content.trim()) {
          await db.createMemory(userId, {
            content: m.content.slice(0, 500),
            category: m.category || "preference",
            workspaceId: m.workspaceId,
          });
          restoredMemories++;
        }
      }
    }

    res.json({
      success: true,
      message: `Restored backup data successfully: ${restoredConversations} chats, ${restoredWorkspaces} workspaces, ${restoredMemories} memories.`,
      restored: {
        conversations: restoredConversations,
        workspaces: restoredWorkspaces,
        memories: restoredMemories,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/backup/import - Import user backup
backupRouter.post("/import", handleImport);

// POST /api/backup/restore - Legacy alias for restore
backupRouter.post("/restore", handleImport);

