import { Router } from "express";
import { aiOrchestrator } from "../ai/aiOrchestrator";
import { supabaseService } from "../db/supabaseClient";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const fallbackSummary = aiOrchestrator.healthRegistry.getHealthSummary();
  const supabaseStatus = supabaseService.getStatusSummary();

  res.json({
    status: "ok",
    app: "RSR Nexora",
    appName: "RSR Nexora",
    studio: "RSR Studios",
    packageId: "com.rsr.nexora",
    branding: {
      appName: "RSR Nexora",
      studio: "RSR Studios",
      packageId: "com.rsr.nexora",
    },
    version: "5.0.0-production-qa",
    releaseVersion: "7.0.0-production",
    releaseStage: "V7 Production Release",
    ready: true,
    environment: process.env.NODE_ENV || "development",
    backend: {
      status: "running",
      uptime: Math.floor(process.uptime()),
    },
    database: {
      status: "ready",
      persistence: supabaseStatus.configured ? "supabase-postgresql" : "in-memory-with-indices",
      supabase: {
        configured: supabaseStatus.configured,
        urlConfigured: supabaseStatus.urlConfigured,
        anonKeyConfigured: supabaseStatus.anonKeyConfigured,
        missing: supabaseStatus.missing,
      },
    },
    ai: {
      configured: Boolean(process.env.GEMINI_API_KEY || fallbackSummary.configuredProviders > 0),
      provider: "Google Gemini",
    },
    hasApiKey: Boolean(process.env.GEMINI_API_KEY || fallbackSummary.configuredProviders > 0),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    provider: "Google Gemini",
    fallbackEnabled: fallbackSummary.fallbackEnabled,
    totalSlots: fallbackSummary.totalSlots,
    configuredProviders: fallbackSummary.configuredProviders,
    healthyProviders: fallbackSummary.healthyProviders,
    fallback: {
      fallbackEnabled: fallbackSummary.fallbackEnabled,
      totalSlots: fallbackSummary.totalSlots,
      configuredProviders: fallbackSummary.configuredProviders,
      healthyProviders: fallbackSummary.healthyProviders,
      cooldownProviders: fallbackSummary.cooldownProviders,
      unconfiguredProviders: fallbackSummary.unconfiguredProviders,
      primarySlot: fallbackSummary.primarySlot,
      primaryStatus: fallbackSummary.primaryStatus,
      totalFailovers: fallbackSummary.totalFailovers,
    },
    security: {
      headersEnabled: true,
      rateLimiting: "active-tiered",
      authEngine: "scrypt-salt-sessions",
      promptDefense: "4-tier-trust-hierarchy",
      dataIsolation: "user-authorized",
      fileUploads: "extension-and-size-guarded",
    },
    capabilities: [
      "smart-chat-modes",
      "token-streaming",
      "web-search-grounding",
      "ai-image-generation",
      "voice-speech",
      "document-intelligence",
      "workspaces",
      "transparent-memory",
      "version-branching",
      "code-inspection",
      "10-api-automatic-fallback",
    ],
    timestamp: Date.now(),
  });
});

healthRouter.get("/providers", (_req, res) => {
  const statuses = aiOrchestrator.healthRegistry.getAllSlotStatuses();
  const summary = aiOrchestrator.healthRegistry.getHealthSummary();

  res.json({
    status: "ok",
    summary,
    slots: statuses,
    timestamp: Date.now(),
  });
});

healthRouter.get("/ready", (_req, res) => {
  const supabaseStatus = supabaseService.getStatusSummary();
  res.json({
    status: "ready",
    app: "RSR Nexora",
    ready: true,
    database: {
      ready: true,
      persistence: supabaseStatus.configured ? "supabase-postgresql" : "in-memory-with-indices",
      supabaseConfigured: supabaseStatus.configured,
    },
    timestamp: Date.now(),
  });
});

healthRouter.get("/database", async (_req, res) => {
  const summary = supabaseService.getStatusSummary();
  if (!summary.configured) {
    return res.status(503).json({
      status: "unconfigured",
      configured: false,
      missing: summary.missing,
      message: `Supabase configuration missing: ${summary.missing.join(", ")}`,
      engine: "in-memory-fallback",
      timestamp: Date.now(),
    });
  }

  const result = await supabaseService.testConnection();
  if (!result.success) {
    const isPermissionIssue = result.code === "42501" || result.error?.includes("permission denied");
    return res.status(503).json({
      status: isPermissionIssue ? "permission_grant_required" : "connection_failed",
      configured: true,
      reachable: isPermissionIssue ? true : false,
      message: result.message,
      error: result.error,
      code: result.code,
      tablesDetected: result.tablesDetected || [],
      requiredAction: result.requiredAction,
      timestamp: Date.now(),
    });
  }

  return res.json({
    status: "connected",
    configured: true,
    reachable: true,
    latencyMs: result.latencyMs,
    tablesDetected: result.tablesDetected || [],
    message: "SUPABASE PRODUCTION PERSISTENCE CONNECTED AND VERIFIED",
    timestamp: Date.now(),
  });
});

