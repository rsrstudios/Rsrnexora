/**
 * RSR NEXORA — SUPABASE CLIENT & CONNECTIVITY ENGINE
 * Product: RSR Nexora | Studio: RSR Studios | Package ID: com.rsr.nexora
 * 
 * SECURITY MANDATES:
 * - Never leak SUPABASE_SERVICE_ROLE_KEY to frontend bundles or client responses.
 * - Never log or print secret tokens.
 * - Privileged database operations use the Service Role client strictly on Node.js server.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfigStatus {
  configured: boolean;
  missing: string[];
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  serviceRoleKeyConfigured: boolean;
  connected?: boolean;
  reachable?: boolean;
  errorMessage?: string;
  checkedAt: number;
}

export interface SupabaseTestResult {
  success: boolean;
  message: string;
  missing: string[];
  latencyMs?: number;
  error?: string;
  code?: string;
  tablesDetected?: string[];
  requiredAction?: string;
}

class SupabaseService {
  private adminClient: SupabaseClient | null = null;
  private anonClient: SupabaseClient | null = null;

  public getConfig(): { url: string; anonKey: string; serviceRoleKey: string } {
    return {
      url: (process.env.SUPABASE_URL || "").trim(),
      anonKey: (process.env.SUPABASE_ANON_KEY || "").trim(),
      serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    };
  }

  public getMissingVariables(): string[] {
    const missing: string[] = [];
    const cfg = this.getConfig();

    if (!cfg.url || cfg.url.includes("PASTE_SUPABASE_PROJECT_URL_HERE")) {
      missing.push("SUPABASE_URL");
    }
    if (!cfg.anonKey || cfg.anonKey.includes("PASTE_SUPABASE_ANON_KEY_HERE")) {
      missing.push("SUPABASE_ANON_KEY");
    }
    if (!cfg.serviceRoleKey || cfg.serviceRoleKey.includes("PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE")) {
      missing.push("SUPABASE_SERVICE_ROLE_KEY");
    }

    return missing;
  }

  public isConfigured(): boolean {
    return this.getMissingVariables().length === 0;
  }

  public getAdminClient(): SupabaseClient | null {
    if (this.adminClient) return this.adminClient;
    const cfg = this.getConfig();
    if (!this.isConfigured()) return null;

    try {
      this.adminClient = createClient(cfg.url, cfg.serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      return this.adminClient;
    } catch (err) {
      console.error("[Supabase] Failed to initialize admin client:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  public getAnonClient(): SupabaseClient | null {
    if (this.anonClient) return this.anonClient;
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.anonKey) return null;

    try {
      this.anonClient = createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      return this.anonClient;
    } catch (err) {
      console.error("[Supabase] Failed to initialize anon client:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Introspects the Supabase PostgREST OpenAPI spec to detect all existing tables.
   */
  public async detectExistingTables(): Promise<string[]> {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.serviceRoleKey) return [];
    try {
      const res = await fetch(`${cfg.url}/rest/v1/`, {
        headers: {
          apikey: cfg.serviceRoleKey,
          Authorization: `Bearer ${cfg.serviceRoleKey}`,
        },
      });
      if (!res.ok) return [];
      const spec = (await res.json()) as { paths?: Record<string, any> };
      if (!spec.paths) return [];
      return Object.keys(spec.paths)
        .filter((p) => p.startsWith("/") && !p.startsWith("/rpc") && p !== "/")
        .map((p) => p.slice(1));
    } catch {
      return [];
    }
  }

  /**
   * Real Connectivity Test against the configured Supabase project.
   * Performs an actual network call to verify reachability and credential validity.
   */
  public async testConnection(): Promise<SupabaseTestResult> {
    const missing = this.getMissingVariables();
    if (missing.length > 0) {
      return {
        success: false,
        message: `Supabase configuration missing: ${missing.join(", ")}`,
        missing,
        error: "MISSING_CREDENTIALS",
      };
    }

    const client = this.getAdminClient();
    if (!client) {
      return {
        success: false,
        message: "Failed to create Supabase client with provided credentials.",
        missing: [],
        error: "CLIENT_INIT_FAILED",
      };
    }

    const start = Date.now();
    try {
      // Step 1: Detect tables from PostgREST
      const detectedTables = await this.detectExistingTables();

      // Step 2: Query users table to verify data-level access
      const { error } = await client.from("users").select("id").limit(1);
      const latencyMs = Date.now() - start;

      if (error) {
        if (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist")) {
          return {
            success: true,
            message: "Supabase connection verified (tables not yet created; execute schema.sql)",
            missing: [],
            latencyMs,
            tablesDetected: detectedTables,
          };
        }

        if (error.code === "42501" || error.message?.includes("permission denied")) {
          return {
            success: false,
            code: "42501",
            message: `Supabase project reachable and verified. ${detectedTables.length} PostgreSQL tables detected, but PostgreSQL role requires GRANT permissions (Code: 42501).`,
            missing: [],
            latencyMs,
            error: error.message,
            tablesDetected: detectedTables,
            requiredAction:
              "Execute in Supabase SQL Editor: GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, anon, authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, anon, authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, anon, authenticated;",
          };
        }

        return {
          success: false,
          code: error.code,
          message: `Supabase connection error: ${error.message} (Code: ${error.code})`,
          missing: [],
          latencyMs,
          error: error.message,
          tablesDetected: detectedTables,
        };
      }

      return {
        success: true,
        message: "Supabase production persistence connected and verified.",
        missing: [],
        latencyMs,
        tablesDetected: detectedTables,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Supabase connection failed: ${errMsg}`,
        missing: [],
        latencyMs,
        error: errMsg,
      };
    }
  }

  /**
   * Returns current health & configuration status without exposing credentials.
   */
  public getStatusSummary(): SupabaseConfigStatus {
    const cfg = this.getConfig();
    const missing = this.getMissingVariables();
    const configured = missing.length === 0;

    return {
      configured,
      missing,
      urlConfigured: Boolean(cfg.url && !cfg.url.includes("PASTE_")),
      anonKeyConfigured: Boolean(cfg.anonKey && !cfg.anonKey.includes("PASTE_")),
      serviceRoleKeyConfigured: Boolean(cfg.serviceRoleKey && !cfg.serviceRoleKey.includes("PASTE_")),
      checkedAt: Date.now(),
    };
  }
}

export const supabaseService = new SupabaseService();
