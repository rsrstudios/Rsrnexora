import { Router } from "express";
import { authenticateSession, requireAuth } from "../middleware/authMiddleware";
import { db } from "../db/database";
import { sanitizeUntrustedText } from "../security/sanitizer";

export const workspaceRouter = Router();

workspaceRouter.use(authenticateSession);

const DEFAULT_TEMPLATES = [
  {
    id: "general",
    name: "General Workspace",
    description: "Everyday queries, writing, and broad analysis",
    icon: "Folder",
    customInstructions: "Provide clear, structured, and insightful answers with concise summaries.",
  },
  {
    id: "software-dev",
    name: "Software Architecture",
    description: "Full-stack development, code review, and debugging",
    icon: "Code",
    customInstructions: "Adopt a senior software engineer perspective. Write idiomatic, robust code with strict type-safety and modern patterns.",
  },
  {
    id: "research-lab",
    name: "Deep Research",
    description: "Evidence-based investigation and academic synthesis",
    icon: "Search",
    customInstructions: "Synthesize facts rigorously, cite verifiable data sources, and clarify uncertainties or conflicting evidence.",
  },
  {
    id: "creative-studio",
    name: "Creative Studio",
    description: "Concept development, copywriting, and visual art prompts",
    icon: "Sparkles",
    customInstructions: "Foster lateral thinking, evocative prose, and vivid descriptive imagery for prompts and creative drafts.",
  },
];

// GET /api/workspace/templates - Static templates
workspaceRouter.get("/templates", (_req, res) => {
  res.json({ templates: DEFAULT_TEMPLATES });
});

// GET /api/workspace - List user workspaces (strict user authorization)
workspaceRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const workspaces = await db.listWorkspaces(userId);
    res.json({ workspaces });
  } catch (err) {
    next(err);
  }
});

// POST /api/workspace - Create workspace for current user
workspaceRouter.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name, description, icon, customInstructions } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({
        error: {
          code: "INVALID_WORKSPACE_NAME",
          message: "Workspace name is required.",
        },
      });
      return;
    }

    const cleanName = sanitizeUntrustedText(name.trim(), 60);
    const cleanDesc = sanitizeUntrustedText(description || "", 200);
    const cleanInstructions = sanitizeUntrustedText(customInstructions || "", 1000);

    const ws = await db.createWorkspace({
      userId,
      name: cleanName,
      description: cleanDesc,
      icon: typeof icon === "string" ? icon.slice(0, 30) : "Folder",
      customInstructions: cleanInstructions,
    });

    res.status(201).json({ success: true, workspace: ws });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workspace/:id - Delete workspace (ownership enforced)
workspaceRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const workspaceId = req.params.id;

    const ws = await db.getWorkspace(userId, workspaceId);
    if (!ws) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Workspace not found or unauthorized.",
        },
      });
      return;
    }

    const deleted = await db.deleteWorkspace(userId, workspaceId);
    if (!deleted) {
      res.status(400).json({
        error: {
          code: "DELETE_FAILED",
          message: "Could not delete this workspace.",
        },
      });
      return;
    }

    res.json({ success: true, message: "Workspace deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workspace - Delete workspace by query or body ID
workspaceRouter.delete("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const workspaceId = (req.query.id as string) || req.body?.id;

    if (!workspaceId) {
      res.status(400).json({
        error: {
          code: "MISSING_WORKSPACE_ID",
          message: "A workspace id parameter is required.",
        },
      });
      return;
    }

    const ws = await db.getWorkspace(userId, workspaceId);
    if (!ws) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Workspace not found or unauthorized.",
        },
      });
      return;
    }

    const deleted = await db.deleteWorkspace(userId, workspaceId);
    if (!deleted) {
      res.status(400).json({
        error: {
          code: "DELETE_FAILED",
          message: "Could not delete this workspace.",
        },
      });
      return;
    }

    res.json({ success: true, message: "Workspace deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/workspace/:id - Update workspace details
workspaceRouter.patch("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const workspaceId = req.params.id;
    const { name, description, icon, customInstructions } = req.body;

    const ws = await db.getWorkspace(userId, workspaceId);
    if (!ws) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Workspace not found or unauthorized.",
        },
      });
      return;
    }

    if (name && typeof name === "string") {
      ws.name = sanitizeUntrustedText(name.trim(), 60);
    }
    if (description !== undefined && typeof description === "string") {
      ws.description = sanitizeUntrustedText(description.trim(), 200);
    }
    if (icon && typeof icon === "string") {
      ws.icon = icon.slice(0, 30);
    }
    if (customInstructions !== undefined && typeof customInstructions === "string") {
      ws.customInstructions = sanitizeUntrustedText(customInstructions.trim(), 1000);
    }
    ws.updatedAt = Date.now();

    res.json({ success: true, workspace: ws });
  } catch (err) {
    next(err);
  }
});

