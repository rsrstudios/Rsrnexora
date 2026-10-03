/**
 * RSR NEXORA — SUPABASE REPOSITORY LAYER
 * Product: RSR Nexora | Studio: RSR Studios | Package ID: com.rsr.nexora
 * 
 * Provides production-ready database operations backed by Supabase PostgreSQL.
 * Strictly adheres to the executed PostgreSQL schema across all 11 tables:
 * - users
 * - sessions
 * - settings
 * - workspaces
 * - conversations
 * - messages
 * - memories
 * - attachments
 * - daily_usage
 * - subscriptions
 * - payment_metadata
 * 
 * Privileged server-side queries execute via Supabase Service Role client.
 */

import crypto from "crypto";
import { supabaseService } from "./supabaseClient";
import {
  UserRecord,
  SessionRecord,
  WorkspaceRecord,
  ConversationRecord,
  MemoryRecord,
  UserSettingsRecord,
  AttachmentRecord,
  DailyUsageRecord,
  SubscriptionRecord,
} from "./database";
import { UserPlan } from "../config/dailyLimitsConfig";
import { generateSecureId } from "../security/crypto";

/**
 * Deterministically converts any internal string ID into a valid RFC 4122 UUID.
 * Preserves standard UUIDs untouched.
 */
export function toUuid(id: string): string {
  if (!id) return crypto.randomUUID();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const hash = crypto.createHash("sha256").update(id).digest("hex");
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

export class SupabaseRepository {
  private get client() {
    return supabaseService.getAdminClient();
  }

  public isAvailable(): boolean {
    return supabaseService.isConfigured() && this.client !== null;
  }

  // ==========================================
  // 1. USERS
  // Schema: id (uuid), email (text), password_hash (text), display_name (text), plan (text), created_at (timestamptz), updated_at (timestamptz)
  // ==========================================
  public async createUser(data: {
    email?: string;
    name: string;
    passwordHash?: string;
    passwordSalt?: string;
    isGuest?: boolean;
    tier?: UserPlan;
  }): Promise<UserRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const isGuest = Boolean(data.isGuest);
    const emailToUse = data.email ? data.email.toLowerCase() : null;
    const internalUserId = generateSecureId("usr");
    const uuid = toUuid(internalUserId);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // Store salt together with hash if provided
    const combinedHash = data.passwordSalt
      ? `${data.passwordSalt}:${data.passwordHash || ""}`
      : data.passwordHash || "";

    const row = {
      id: uuid,
      email: emailToUse,
      display_name: data.name,
      password_hash: combinedHash,
      plan: data.tier || (isGuest ? "guest" : "free"),
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { error } = await client.from("users").insert(row);
    if (error) {
      if (error.code === "23505") {
        throw new Error("A user with this email address already exists.");
      }
      throw new Error(`Supabase user creation failed: ${error.message}`);
    }

    // Provision default workspace for the new user
    await this.createWorkspace({
      userId: uuid,
      name: "Default Workspace",
      description: "General workspace for daily inquiries and tasks",
      icon: "Folder",
      customInstructions: "",
      isDefault: true,
    }).catch((err) => {
      console.warn("[Supabase] Workspace provisioning notice:", err.message);
    });

    return {
      id: uuid,
      email: row.email || "",
      name: row.display_name,
      passwordHash: data.passwordHash || "",
      passwordSalt: data.passwordSalt || "",
      isGuest,
      tier: (row.plan as UserPlan) || "free",
      createdAt: nowMs,
      updatedAt: nowMs,
    };
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    const client = this.client;
    if (!client) return null;

    const uuid = toUuid(id);
    const { data, error } = await client.from("users").select("*").eq("id", uuid).maybeSingle();
    if (error || !data) return null;

    let passwordHash = data.password_hash || "";
    let passwordSalt = "";
    if (passwordHash.includes(":")) {
      const parts = passwordHash.split(":");
      passwordSalt = parts[0];
      passwordHash = parts.slice(1).join(":");
    }

    return {
      id: data.id,
      email: data.email || "",
      name: data.display_name || "",
      passwordHash,
      passwordSalt,
      isGuest: data.plan === "guest",
      tier: (data.plan as UserPlan) || "free",
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const client = this.client;
    if (!client) return null;

    const { data, error } = await client
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (error || !data) return null;

    let passwordHash = data.password_hash || "";
    let passwordSalt = "";
    if (passwordHash.includes(":")) {
      const parts = passwordHash.split(":");
      passwordSalt = parts[0];
      passwordHash = parts.slice(1).join(":");
    }

    return {
      id: data.id,
      email: data.email || "",
      name: data.display_name || "",
      passwordHash,
      passwordSalt,
      isGuest: data.plan === "guest",
      tier: (data.plan as UserPlan) || "free",
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  // ==========================================
  // 2. SESSIONS
  // Schema: id (uuid), user_id (uuid), session_token_hash (text), expires_at (timestamptz), revoked_at (timestamptz), created_at (timestamptz)
  // ==========================================
  public async createSession(data: {
    userId: string;
    token: string;
    maxAgeMs: number;
    ipAddress: string;
    userAgent: string;
  }): Promise<SessionRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const nowMs = Date.now();
    const expiresAtMs = nowMs + data.maxAgeMs;
    const sessionId = generateSecureId("sess");
    const uuid = toUuid(sessionId);
    const userUuid = toUuid(data.userId);

    const tokenHash = crypto.createHash("sha256").update(data.token).digest("hex");

    const session: SessionRecord = {
      id: sessionId,
      userId: data.userId,
      token: data.token,
      createdAt: nowMs,
      expiresAt: expiresAtMs,
      lastActivityAt: nowMs,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    };

    const row = {
      id: uuid,
      user_id: userUuid,
      session_token_hash: tokenHash,
      expires_at: new Date(expiresAtMs).toISOString(),
      revoked_at: null,
      created_at: new Date(nowMs).toISOString(),
    };

    const { error } = await client.from("sessions").insert(row);
    if (error) throw new Error(`Supabase session creation failed: ${error.message}`);
    return session;
  }

  public async getSession(token: string): Promise<SessionRecord | null> {
    const client = this.client;
    if (!client) return null;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { data, error } = await client
      .from("sessions")
      .select("*")
      .eq("session_token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (error || !data) return null;

    const now = Date.now();
    const expiresAt = new Date(data.expires_at).getTime();
    if (now > expiresAt) {
      await client.from("sessions").delete().eq("id", data.id);
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      token,
      createdAt: new Date(data.created_at).getTime(),
      expiresAt,
      lastActivityAt: now,
      ipAddress: "",
      userAgent: "",
    };
  }

  public async deleteSession(token: string): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { error } = await client
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("session_token_hash", tokenHash);
    return !error;
  }

  public async deleteUserSessions(userId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    const userUuid = toUuid(userId);
    await client
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userUuid);
  }

  // ==========================================
  // 3. SETTINGS
  // Schema: id (uuid), user_id (uuid), settings (jsonb), created_at (timestamptz), updated_at (timestamptz)
  // ==========================================
  public async getUserSettings(userId: string): Promise<UserSettingsRecord> {
    const client = this.client;
    const defaultSettings: UserSettingsRecord = {
      userId,
      theme: "system",
      systemInstruction: "",
      temperature: 0.7,
      webSearchEnabled: true,
      memoryEnabled: true,
      fontSize: "default",
      voiceSpeed: 1.0,
      voicePitch: 1.0,
      updatedAt: Date.now(),
    };

    if (!client) return defaultSettings;

    const userUuid = toUuid(userId);
    const { data, error } = await client
      .from("settings")
      .select("*")
      .eq("user_id", userUuid)
      .maybeSingle();

    if (error || !data || !data.settings) return defaultSettings;

    const s = data.settings;
    return {
      userId,
      theme: s.theme || "system",
      systemInstruction: s.systemInstruction || "",
      temperature: typeof s.temperature === "number" ? s.temperature : 0.7,
      webSearchEnabled: s.webSearchEnabled ?? true,
      memoryEnabled: s.memoryEnabled ?? true,
      fontSize: s.fontSize || "default",
      voiceSpeed: typeof s.voiceSpeed === "number" ? s.voiceSpeed : 1.0,
      voicePitch: typeof s.voicePitch === "number" ? s.voicePitch : 1.0,
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async updateUserSettings(
    userId: string,
    updates: Partial<UserSettingsRecord>
  ): Promise<UserSettingsRecord> {
    const current = await this.getUserSettings(userId);
    const nowIso = new Date().toISOString();
    const updated: UserSettingsRecord = {
      ...current,
      ...updates,
      userId,
      updatedAt: Date.now(),
    };

    const client = this.client;
    if (client) {
      const userUuid = toUuid(userId);
      const settingsId = toUuid(`settings_${userId}`);
      await client.from("settings").upsert({
        id: settingsId,
        user_id: userUuid,
        settings: {
          theme: updated.theme,
          systemInstruction: updated.systemInstruction,
          temperature: updated.temperature,
          webSearchEnabled: updated.webSearchEnabled,
          memoryEnabled: updated.memoryEnabled,
          fontSize: updated.fontSize,
          voiceSpeed: updated.voiceSpeed,
          voicePitch: updated.voicePitch,
        },
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    return updated;
  }

  // ==========================================
  // 4. WORKSPACES
  // Schema: id (uuid), user_id (uuid), name (text), description (text), metadata (jsonb), created_at (timestamptz), updated_at (timestamptz)
  // ==========================================
  public async createWorkspace(data: {
    userId: string;
    name: string;
    description?: string;
    icon?: string;
    customInstructions?: string;
    isDefault?: boolean;
  }): Promise<WorkspaceRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const wsId = generateSecureId("ws");
    const wsUuid = toUuid(wsId);
    const userUuid = toUuid(data.userId);

    const ws: WorkspaceRecord = {
      id: wsId,
      userId: data.userId,
      name: data.name,
      description: data.description || "",
      icon: data.icon || "Folder",
      customInstructions: data.customInstructions || "",
      isDefault: Boolean(data.isDefault),
      createdAt: now,
      updatedAt: now,
    };

    const { error } = await client.from("workspaces").insert({
      id: wsUuid,
      user_id: userUuid,
      name: ws.name,
      description: ws.description,
      metadata: {
        icon: ws.icon,
        customInstructions: ws.customInstructions,
        isDefault: ws.isDefault,
        originalId: wsId,
      },
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (error) throw new Error(`Supabase workspace creation failed: ${error.message}`);
    return ws;
  }

  public async listWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    const client = this.client;
    if (!client) return [];

    const userUuid = toUuid(userId);
    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .eq("user_id", userUuid)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    return data.map((d) => {
      const meta = d.metadata || {};
      return {
        id: meta.originalId || d.id,
        userId,
        name: d.name,
        description: d.description || "",
        icon: meta.icon || "Folder",
        customInstructions: meta.customInstructions || "",
        isDefault: Boolean(meta.isDefault),
        createdAt: new Date(d.created_at).getTime(),
        updatedAt: new Date(d.updated_at).getTime(),
      };
    });
  }

  public async getWorkspace(userId: string, workspaceId: string): Promise<WorkspaceRecord | null> {
    const client = this.client;
    if (!client) return null;

    const userUuid = toUuid(userId);
    const wsUuid = toUuid(workspaceId);

    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .eq("id", wsUuid)
      .eq("user_id", userUuid)
      .maybeSingle();

    if (error || !data) return null;

    const meta = data.metadata || {};
    return {
      id: meta.originalId || data.id,
      userId,
      name: data.name,
      description: data.description || "",
      icon: meta.icon || "Folder",
      customInstructions: meta.customInstructions || "",
      isDefault: Boolean(meta.isDefault),
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async deleteWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const client = this.client;
    if (!client) return false;

    const userUuid = toUuid(userId);
    const wsUuid = toUuid(workspaceId);

    const ws = await this.getWorkspace(userId, workspaceId);
    if (!ws) return false;
    if (ws.isDefault) throw new Error("Cannot delete default workspace.");

    const { error } = await client
      .from("workspaces")
      .delete()
      .eq("id", wsUuid)
      .eq("user_id", userUuid);

    return !error;
  }

  // ==========================================
  // 5. CONVERSATIONS & MESSAGES
  // Schema conversations: id (uuid), user_id (uuid), workspace_id (uuid), title (text), metadata (jsonb), created_at (timestamptz), updated_at (timestamptz)
  // Schema messages: id (uuid), conversation_id (uuid), user_id (uuid), role (text), content (text), model (text), metadata (jsonb), created_at (timestamptz)
  // ==========================================
  public async listConversations(userId: string, workspaceId?: string): Promise<ConversationRecord[]> {
    const client = this.client;
    if (!client) return [];

    const userUuid = toUuid(userId);
    let query = client.from("conversations").select("*").eq("user_id", userUuid);

    if (workspaceId && workspaceId !== "default") {
      query = query.eq("workspace_id", toUuid(workspaceId));
    }
    query = query.order("updated_at", { ascending: false });

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((c) => {
      const meta = c.metadata || {};
      return {
        id: meta.originalId || c.id,
        userId,
        workspaceId: c.workspace_id || "default",
        title: c.title,
        model: meta.model || "balanced",
        mode: meta.mode || "chat",
        messages: meta.messages || [],
        isPinned: Boolean(meta.isPinned),
        isFavorite: Boolean(meta.isFavorite),
        isArchived: Boolean(meta.isArchived),
        createdAt: new Date(c.created_at).getTime(),
        updatedAt: new Date(c.updated_at).getTime(),
      };
    });
  }

  public async getConversation(userId: string, conversationId: string): Promise<ConversationRecord | null> {
    const client = this.client;
    if (!client) return null;

    const userUuid = toUuid(userId);
    const convUuid = toUuid(conversationId);

    const { data, error } = await client
      .from("conversations")
      .select("*")
      .eq("id", convUuid)
      .eq("user_id", userUuid)
      .maybeSingle();

    if (error || !data) return null;

    const meta = data.metadata || {};

    // Also attempt fetching messages from messages table if available
    let messages = meta.messages || [];
    const { data: dbMessages } = await client
      .from("messages")
      .select("*")
      .eq("conversation_id", convUuid)
      .order("created_at", { ascending: true });

    if (dbMessages && dbMessages.length > 0) {
      messages = dbMessages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        timestamp: new Date(m.created_at).getTime(),
        model: m.model,
        mode: (m.metadata && m.metadata.mode) || meta.mode,
      }));
    }

    return {
      id: meta.originalId || data.id,
      userId,
      workspaceId: data.workspace_id || "default",
      title: data.title,
      model: meta.model || "balanced",
      mode: meta.mode || "chat",
      messages,
      isPinned: Boolean(meta.isPinned),
      isFavorite: Boolean(meta.isFavorite),
      isArchived: Boolean(meta.isArchived),
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async saveConversation(
    userId: string,
    data: Partial<ConversationRecord> & { id?: string }
  ): Promise<ConversationRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const now = Date.now();
    const id = data.id || generateSecureId("conv");
    const convUuid = toUuid(id);
    const userUuid = toUuid(userId);

    const existing = await this.getConversation(userId, id);

    const record: ConversationRecord = {
      id,
      userId,
      workspaceId: data.workspaceId || existing?.workspaceId || "default",
      title: data.title || existing?.title || "New Conversation",
      model: data.model || existing?.model || "balanced",
      mode: data.mode || existing?.mode || "chat",
      messages: data.messages || existing?.messages || [],
      isPinned: data.isPinned ?? existing?.isPinned ?? false,
      isFavorite: data.isFavorite ?? existing?.isFavorite ?? false,
      isArchived: data.isArchived ?? existing?.isArchived ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const row = {
      id: convUuid,
      user_id: userUuid,
      workspace_id: record.workspaceId === "default" ? null : toUuid(record.workspaceId),
      title: record.title,
      metadata: {
        originalId: id,
        model: record.model,
        mode: record.mode,
        isPinned: record.isPinned,
        isFavorite: record.isFavorite,
        isArchived: record.isArchived,
        messages: record.messages,
      },
      created_at: new Date(record.createdAt).toISOString(),
      updated_at: new Date(record.updatedAt).toISOString(),
    };

    const { error } = await client.from("conversations").upsert(row);
    if (error) throw new Error(`Supabase save conversation failed: ${error.message}`);

    // Persist messages in messages table asynchronously
    if (record.messages && record.messages.length > 0) {
      const msgRows = record.messages.map((m, idx) => ({
        id: toUuid(m.id || `${id}_msg_${idx}`),
        conversation_id: convUuid,
        user_id: userUuid,
        role: m.role || "user",
        content: m.content || "",
        model: m.model || record.model || "balanced",
        metadata: { originalId: m.id, mode: m.mode },
        created_at: new Date(m.timestamp || now).toISOString(),
      }));

      try {
        await client.from("messages").upsert(msgRows);
      } catch (err: any) {
        console.warn("[Supabase] Notice saving messages:", err?.message);
      }
    }

    return record;
  }

  public async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const client = this.client;
    if (!client) return false;

    const convUuid = toUuid(conversationId);
    const userUuid = toUuid(userId);

    // Clean up messages first
    await client.from("messages").delete().eq("conversation_id", convUuid).eq("user_id", userUuid);
    const { error } = await client.from("conversations").delete().eq("id", convUuid).eq("user_id", userUuid);
    return !error;
  }

  public async clearUserConversations(userId: string): Promise<number> {
    const client = this.client;
    if (!client) return 0;
    const userUuid = toUuid(userId);
    await client.from("messages").delete().eq("user_id", userUuid);
    const { data } = await client.from("conversations").delete().eq("user_id", userUuid).select("id");
    return data ? data.length : 0;
  }

  // ==========================================
  // 6. MEMORIES
  // Schema: id (uuid), user_id (uuid), content (text), metadata (jsonb), created_at (timestamptz), updated_at (timestamptz)
  // ==========================================
  public async listMemories(userId: string): Promise<MemoryRecord[]> {
    const client = this.client;
    if (!client) return [];

    const userUuid = toUuid(userId);
    const { data, error } = await client
      .from("memories")
      .select("*")
      .eq("user_id", userUuid)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    return data.map((m) => {
      const meta = m.metadata || {};
      return {
        id: meta.originalId || m.id,
        userId,
        workspaceId: meta.workspaceId || undefined,
        content: m.content,
        category: (meta.category as "preference" | "fact" | "instruction") || "fact",
        createdAt: new Date(m.created_at).getTime(),
      };
    });
  }

  public async createMemory(
    userId: string,
    data: { content: string; category: "preference" | "fact" | "instruction"; workspaceId?: string }
  ): Promise<MemoryRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const now = Date.now();
    const memId = generateSecureId("mem");
    const memUuid = toUuid(memId);
    const userUuid = toUuid(userId);

    const memory: MemoryRecord = {
      id: memId,
      userId,
      workspaceId: data.workspaceId,
      content: data.content,
      category: data.category,
      createdAt: now,
    };

    const row = {
      id: memUuid,
      user_id: userUuid,
      content: memory.content,
      metadata: {
        originalId: memId,
        category: memory.category,
        workspaceId: memory.workspaceId || null,
      },
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    const { error } = await client.from("memories").insert(row);
    if (error) throw new Error(`Supabase memory creation failed: ${error.message}`);
    return memory;
  }

  public async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const client = this.client;
    if (!client) return false;

    const userUuid = toUuid(userId);
    const memUuid = toUuid(memoryId);

    const { error } = await client.from("memories").delete().eq("id", memUuid).eq("user_id", userUuid);
    return !error;
  }

  public async clearUserMemories(userId: string): Promise<number> {
    const client = this.client;
    if (!client) return 0;
    const userUuid = toUuid(userId);
    const { data } = await client.from("memories").delete().eq("user_id", userUuid).select("id");
    return data ? data.length : 0;
  }

  // ==========================================
  // 7. ATTACHMENTS
  // Schema: id (uuid), user_id (uuid), conversation_id (uuid), file_name (text), storage_path (text), mime_type (text), file_size (bigint), metadata (jsonb), created_at (timestamptz)
  // ==========================================
  public async recordAttachment(data: {
    userId: string;
    originalName: string;
    storageName: string;
    mimeType: string;
    sizeBytes: number;
    conversationId?: string;
  }): Promise<AttachmentRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const now = Date.now();
    const attId = generateSecureId("att");
    const attUuid = toUuid(attId);
    const userUuid = toUuid(data.userId);

    const record: AttachmentRecord = {
      id: attId,
      userId: data.userId,
      originalName: data.originalName,
      storageName: data.storageName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      createdAt: now,
    };

    const { error } = await client.from("attachments").insert({
      id: attUuid,
      user_id: userUuid,
      conversation_id: data.conversationId ? toUuid(data.conversationId) : null,
      file_name: record.originalName,
      storage_path: record.storageName,
      mime_type: record.mimeType,
      file_size: record.sizeBytes,
      metadata: { originalId: attId },
      created_at: new Date(now).toISOString(),
    });

    if (error) throw new Error(`Supabase attachment record failed: ${error.message}`);
    return record;
  }

  public async getAttachment(userId: string, attachmentId: string): Promise<AttachmentRecord | null> {
    const client = this.client;
    if (!client) return null;

    const userUuid = toUuid(userId);
    const attUuid = toUuid(attachmentId);

    const { data, error } = await client
      .from("attachments")
      .select("*")
      .eq("id", attUuid)
      .eq("user_id", userUuid)
      .maybeSingle();

    if (error || !data) return null;

    const meta = data.metadata || {};
    return {
      id: meta.originalId || data.id,
      userId,
      originalName: data.file_name,
      storageName: data.storage_path,
      mimeType: data.mime_type,
      sizeBytes: Number(data.file_size),
      createdAt: new Date(data.created_at).getTime(),
    };
  }

  // ==========================================
  // 8. DAILY USAGE
  // Schema: id (uuid), user_id (uuid), usage_date (date), messages_used (int), images_used (int), searches_used (int), files_used (int), created_at (timestamptz), updated_at (timestamptz)
  // ==========================================
  public async getDailyUsage(userId: string, utcDate: string): Promise<DailyUsageRecord> {
    const client = this.client;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const usageId = generateSecureId("usg");
    const userUuid = toUuid(userId);
    const usageUuid = toUuid(`${userId}_${utcDate}`);

    const fallback: DailyUsageRecord = {
      id: usageId,
      userId,
      utcDate,
      messagesUsed: 0,
      imagesUsed: 0,
      searchesUsed: 0,
      filesUsed: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (!client) return fallback;

    const { data, error } = await client
      .from("daily_usage")
      .select("*")
      .eq("user_id", userUuid)
      .eq("usage_date", utcDate)
      .maybeSingle();

    if (error || !data) {
      try {
        await client.from("daily_usage").upsert({
          id: usageUuid,
          user_id: userUuid,
          usage_date: utcDate,
          messages_used: 0,
          images_used: 0,
          searches_used: 0,
          files_used: 0,
          created_at: nowIso,
          updated_at: nowIso,
        });
      } catch {
        // Fallback gracefully
      }
      return fallback;
    }

    return {
      id: data.id,
      userId,
      utcDate: data.usage_date,
      messagesUsed: data.messages_used || 0,
      imagesUsed: data.images_used || 0,
      searchesUsed: data.searches_used || 0,
      filesUsed: data.files_used || 0,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async syncDailyUsage(record: DailyUsageRecord): Promise<void> {
    const client = this.client;
    if (!client) return;

    const userUuid = toUuid(record.userId);
    const usageUuid = toUuid(`${record.userId}_${record.utcDate}`);

    await client.from("daily_usage").upsert({
      id: usageUuid,
      user_id: userUuid,
      usage_date: record.utcDate,
      messages_used: record.messagesUsed,
      images_used: record.imagesUsed,
      searches_used: record.searchesUsed,
      files_used: record.filesUsed,
      created_at: new Date(record.createdAt).toISOString(),
      updated_at: new Date(record.updatedAt).toISOString(),
    });
  }

  // ==========================================
  // 9. SUBSCRIPTIONS
  // Schema: id (uuid), user_id (uuid), plan (text), status (text), provider (text), provider_subscription_id (text), provider_customer_id (text), started_at (timestamptz), expires_at (timestamptz), cancelled_at (timestamptz), metadata (jsonb), created_at (timestamptz), updated_at (timestamptz)
  // ==========================================
  public async getSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const client = this.client;
    if (!client) return null;

    const userUuid = toUuid(userId);
    const { data, error } = await client
      .from("subscriptions")
      .select("*")
      .eq("user_id", userUuid)
      .maybeSingle();

    if (error || !data) return null;

    const meta = data.metadata || {};
    return {
      subscriptionId: meta.originalId || data.id,
      userId,
      plan: data.plan,
      status: data.status,
      provider: data.provider,
      providerCustomerId: data.provider_customer_id || "",
      providerSubscriptionId: data.provider_subscription_id || "",
      currentPeriodStart: data.started_at ? new Date(data.started_at).getTime() : 0,
      currentPeriodEnd: data.expires_at ? new Date(data.expires_at).getTime() : 0,
      cancelAtPeriodEnd: Boolean(meta.cancelAtPeriodEnd),
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async getSubscriptionByProviderSubId(providerSubId: string): Promise<SubscriptionRecord | null> {
    const client = this.client;
    if (!client || !providerSubId) return null;

    const { data, error } = await client
      .from("subscriptions")
      .select("*")
      .eq("provider_subscription_id", providerSubId)
      .maybeSingle();

    if (error || !data) return null;

    const meta = data.metadata || {};
    return {
      subscriptionId: meta.originalId || data.id,
      userId: meta.userId || data.user_id,
      plan: data.plan,
      status: data.status,
      provider: data.provider,
      providerCustomerId: data.provider_customer_id || "",
      providerSubscriptionId: data.provider_subscription_id || "",
      currentPeriodStart: data.started_at ? new Date(data.started_at).getTime() : 0,
      currentPeriodEnd: data.expires_at ? new Date(data.expires_at).getTime() : 0,
      cancelAtPeriodEnd: Boolean(meta.cancelAtPeriodEnd),
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  public async saveSubscription(data: Partial<SubscriptionRecord> & { userId: string }): Promise<SubscriptionRecord> {
    const client = this.client;
    if (!client) throw new Error("Supabase is not configured.");

    const now = Date.now();
    const existing = await this.getSubscriptionByUserId(data.userId);
    const subscriptionId = data.subscriptionId || existing?.subscriptionId || generateSecureId("sub");
    const subUuid = toUuid(subscriptionId);
    const userUuid = toUuid(data.userId);

    const record: SubscriptionRecord = {
      subscriptionId,
      userId: data.userId,
      plan: data.plan || existing?.plan || "free",
      status: data.status || existing?.status || "free",
      provider: data.provider || existing?.provider || "razorpay",
      providerCustomerId: data.providerCustomerId || existing?.providerCustomerId || "",
      providerSubscriptionId: data.providerSubscriptionId || existing?.providerSubscriptionId || "",
      currentPeriodStart: data.currentPeriodStart || existing?.currentPeriodStart || now,
      currentPeriodEnd: data.currentPeriodEnd || existing?.currentPeriodEnd || now + 30 * 86400000,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const row = {
      id: subUuid,
      user_id: userUuid,
      plan: record.plan,
      status: record.status,
      provider: record.provider,
      provider_customer_id: record.providerCustomerId,
      provider_subscription_id: record.providerSubscriptionId,
      started_at: new Date(record.currentPeriodStart).toISOString(),
      expires_at: new Date(record.currentPeriodEnd).toISOString(),
      cancelled_at: record.cancelAtPeriodEnd ? new Date().toISOString() : null,
      metadata: {
        originalId: subscriptionId,
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      },
      created_at: new Date(record.createdAt).toISOString(),
      updated_at: new Date(record.updatedAt).toISOString(),
    };

    const { error } = await client.from("subscriptions").upsert(row);
    if (error) throw new Error(`Supabase subscription save failed: ${error.message}`);
    return record;
  }

  // ==========================================
  // 10. PAYMENT METADATA
  // Schema: id (uuid), user_id (uuid), subscription_id (uuid), provider (text), provider_payment_id (text), provider_order_id (text), amount (numeric), currency (text), status (text), idempotency_key (text), metadata (jsonb), created_at (timestamptz)
  // ==========================================
  public async createPaymentMetadata(data: {
    userId: string;
    orderId: string;
    paymentId?: string;
    planId: string;
    amountPaise: number;
    currency?: string;
    status?: string;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const client = this.client;
    if (!client) return;

    const now = Date.now();
    const paymId = generateSecureId("paym");
    const paymUuid = toUuid(paymId);
    const userUuid = toUuid(data.userId);

    await client.from("payment_metadata").insert({
      id: paymUuid,
      user_id: userUuid,
      subscription_id: null,
      provider: "razorpay",
      provider_payment_id: data.paymentId || "",
      provider_order_id: data.orderId,
      amount: data.amountPaise / 100, // Paice to rupees
      currency: data.currency || "INR",
      status: data.status || "created",
      idempotency_key: data.idempotencyKey || data.orderId,
      metadata: {
        planId: data.planId,
        amountPaise: data.amountPaise,
        originalId: paymId,
        ...(data.metadata || {}),
      },
      created_at: new Date(now).toISOString(),
    });
  }
}

export const supabaseRepo = new SupabaseRepository();
