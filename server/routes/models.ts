import { Router } from "express";
import { aiService } from "../ai/aiService";

export const modelsRouter = Router();

modelsRouter.get("/", (_req, res) => {
  try {
    const models = aiService.getAvailableModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to retrieve available AI models" });
  }
});
