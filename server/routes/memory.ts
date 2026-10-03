import { Router } from "express";
import { authenticateSession } from "../middleware/authMiddleware";
import { db } from "../db/database";
import { sanitizeUntrustedText } from "../security/sanitizer";

export const memoryRouter = Router();

memoryRouter.use(authenticateSession);

// GET /api/memory - List memories for current user
memoryRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const memories = await db.listMemories(userId);
    res.json({ memories });
  } catch (err) {
    next(err);
  }
});

// POST /api/memory - Explicitly add a memory
memoryRouter.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { content, category, workspaceId } = req.body;

    if (!content || typeof content !== "string" || !content.trim()) {
      res.status(400).json({
        error: {
          code: "MISSING_CONTENT",
          message: "Memory content cannot be empty.",
        },
      });
      return;
    }

    const validCategories = ["preference", "fact", "instruction"];
    const safeCat = validCategories.includes(category) ? category : "preference";
    const cleanContent = sanitizeUntrustedText(content.trim(), 500);

    const memory = await db.createMemory(userId, {
      content: cleanContent,
      category: safeCat as any,
      workspaceId: typeof workspaceId === "string" ? workspaceId : undefined,
    });

    res.status(201).json({ success: true, memory });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/memory/:id - Delete specific memory (verified ownership)
memoryRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const memoryId = req.params.id;

    const deleted = await db.deleteMemory(userId, memoryId);
    if (!deleted) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Memory item not found or unauthorized.",
        },
      });
      return;
    }

    res.json({ success: true, message: "Memory deleted." });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/memory - Clear all memories for current user
memoryRouter.delete("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const count = await db.clearUserMemories(userId);
    res.json({ success: true, count, message: `Cleared ${count} memories.` });
  } catch (err) {
    next(err);
  }
});
