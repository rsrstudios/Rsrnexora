import { generateSecureId } from "../security/crypto";
import {
  UserPlan,
  LimitResource,
  getDailyLimitsForPlan,
} from "../config/dailyLimitsConfig";
import { supabaseRepo } from "./supabaseRepository";
import { supabaseService } from "./supabaseClient";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  isGuest: boolean;
  tier?: UserPlan;
  createdAt: number;
  updatedAt: number;
}

export type SubscriptionStatus = "free" | "pending" | "active" | "past_due" | "cancelled" | "expired";

export interface SubscriptionRecord {
  subscriptionId: string;
  userId: string;
  plan: "free" | "plus" | "pro" | "ultra";
  status: SubscriptionStatus;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  ipAddress: string;
  userAgent: string;
}

export interface WorkspaceRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  icon: string;
  customInstructions: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  workspaceId: string;
  title: string;
  model: string;
  mode: string;
  messages: any[];
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryRecord {
  id: string;
  userId: string;
  workspaceId?: string;
  content: string;
  category: "preference" | "fact" | "instruction";
  createdAt: number;
}

export interface UserSettingsRecord {
  userId: string;
  theme: "light" | "dark" | "system";
  systemInstruction: string;
  temperature: number;
  webSearchEnabled: boolean;
  memoryEnabled: boolean;
  fontSize: "compact" | "default" | "relaxed";
  voiceSpeed: number;
  voicePitch: number;
  updatedAt: number;
}

export interface AttachmentRecord {
  id: string;
  userId: string;
  originalName: string;
  storageName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

export interface DailyUsageRecord {
  id: string;
  userId: string;
  utcDate: string; // YYYY-MM-DD
  messagesUsed: number;
  imagesUsed: number;
  searchesUsed: number;
  filesUsed: number;
  createdAt: number;
  updatedAt: number;
}

export interface LimitReservationResult {
  allowed: boolean;
  resource: LimitResource;
  plan: UserPlan;
  used: number;
  limit: number;
  remaining: number;
  utcDate: string;
  errorMessage?: string;
}

/**
 * SecurityDatabase — High-Performance In-Memory Repository with Secondary User Indices.
 * 
 * ARCHITECTURAL SCALING ASSESSMENT:
 * The current persistence architecture utilizes optimized in-memory Maps with O(1) primary
 * key lookups and secondary userId Set indices. While this provides sub-millisecond execution
 * for active sessions, multi-instance horizontal scaling in production requires migrating to
 * a distributed durable database (such as Cloud SQL PostgreSQL or Firestore) with connection
 * pooling and transaction locks.
 */
class SecurityDatabase {
  private users = new Map<string, UserRecord>();
  private usersByEmail = new Map<string, string>(); // email -> userId
  private sessions = new Map<string, SessionRecord>(); // token -> SessionRecord
  private workspaces = new Map<string, WorkspaceRecord>();
  private conversations = new Map<string, ConversationRecord>();
  private memories = new Map<string, MemoryRecord>();
  private userSettings = new Map<string, UserSettingsRecord>();
  private attachments = new Map<string, AttachmentRecord>();
  private dailyUsage = new Map<string, DailyUsageRecord>(); // `${userId}:${utcDate}` -> DailyUsageRecord
  private userLocks = new Map<string, Promise<void>>();

  // Secondary indices for O(1) user collection retrieval
  private userWorkspacesIndex = new Map<string, Set<string>>(); // userId -> Set<workspaceId>
  private userConversationsIndex = new Map<string, Set<string>>(); // userId -> Set<conversationId>
  private userMemoriesIndex = new Map<string, Set<string>>(); // userId -> Set<memoryId>
  private userDailyUsageIndex = new Map<string, Set<string>>(); // userId -> Set<recordId>
  private subscriptions = new Map<string, SubscriptionRecord>(); // subscriptionId -> SubscriptionRecord
  private userSubscriptionIndex = new Map<string, string>(); // userId -> subscriptionId
  private providerSubIndex = new Map<string, string>(); // providerSubscriptionId -> subscriptionId
  private processedWebhookEvents = new Set<string>(); // eventId -> boolean
  private revokedSessionTokens = new Set<string>();

  private addToIndex(index: Map<string, Set<string>>, userId: string, recordId: string) {
    let set = index.get(userId);
    if (!set) {
      set = new Set();
      index.set(userId, set);
    }
    set.add(recordId);
  }

  private removeFromIndex(index: Map<string, Set<string>>, userId: string, recordId: string) {
    const set = index.get(userId);
    if (set) {
      set.delete(recordId);
      if (set.size === 0) {
        index.delete(userId);
      }
    }
  }

  // USERS
  public async createUser(data: {
    email?: string;
    name: string;
    passwordHash?: string;
    passwordSalt?: string;
    isGuest?: boolean;
  }): Promise<UserRecord> {
    const isGuest = Boolean(data.isGuest);
    const emailToUse = data.email ? data.email.toLowerCase() : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@rsr-ai.guest`;

    if (data.email && this.usersByEmail.has(emailToUse)) {
      throw new Error("A user with this email address already exists.");
    }

    if (supabaseRepo.isAvailable()) {
      try {
        const record = await supabaseRepo.createUser(data);
        this.users.set(record.id, record);
        if (record.email) {
          this.usersByEmail.set(record.email.toLowerCase(), record.id);
        }

        // Cache default workspace for instant O(1) in-memory availability
        const defaultWsId = generateSecureId("ws");
        const defaultWs: WorkspaceRecord = {
          id: defaultWsId,
          userId: record.id,
          name: "Default Workspace",
          description: "General workspace for daily inquiries and tasks",
          icon: "Folder",
          customInstructions: "",
          isDefault: true,
          createdAt: record.createdAt,
          updatedAt: record.createdAt,
        };
        this.workspaces.set(defaultWs.id, defaultWs);
        this.addToIndex(this.userWorkspacesIndex, record.id, defaultWs.id);

        return record;
      } catch (err: any) {
        if (err.message && err.message.includes("already exists")) {
          throw err;
        }
        console.warn("[Database] Supabase user creation warning, continuing with local engine:", err.message);
      }
    }

    const userId = generateSecureId("usr");
    const now = Date.now();
    const record: UserRecord = {
      id: userId,
      email: data.email || "",
      name: data.name,
      passwordHash: data.passwordHash || "",
      passwordSalt: data.passwordSalt || "",
      isGuest,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(userId, record);
    if (data.email) {
      this.usersByEmail.set(emailToUse, userId);
    }

    // Create default workspace for user
    await this.createWorkspace({
      userId,
      name: "Default Workspace",
      description: "General workspace for daily inquiries and tasks",
      icon: "Folder",
      customInstructions: "",
      isDefault: true,
    });

    return record;
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    const cached = this.users.get(id);
    if (cached) return cached;

    if (supabaseRepo.isAvailable()) {
      try {
        const user = await supabaseRepo.findUserById(id);
        if (user) {
          this.users.set(user.id, user);
          if (user.email) this.usersByEmail.set(user.email.toLowerCase(), user.id);
          return user;
        }
      } catch (err) {
        // Fall through
      }
    }
    return null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const emailKey = email.toLowerCase();
    const id = this.usersByEmail.get(emailKey);
    if (id) {
      const user = this.users.get(id);
      if (user) return user;
    }

    if (supabaseRepo.isAvailable()) {
      try {
        const user = await supabaseRepo.findUserByEmail(emailKey);
        if (user) {
          this.users.set(user.id, user);
          this.usersByEmail.set(emailKey, user.id);
          return user;
        }
      } catch (err) {
        // Fall through
      }
    }
    return null;
  }

  // SESSIONS
  public async createSession(data: {
    userId: string;
    token: string;
    maxAgeMs: number;
    ipAddress: string;
    userAgent: string;
  }): Promise<SessionRecord> {
    const now = Date.now();
    const session: SessionRecord = {
      id: generateSecureId("sess"),
      userId: data.userId,
      token: data.token,
      createdAt: now,
      expiresAt: now + data.maxAgeMs,
      lastActivityAt: now,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    };

    this.sessions.set(data.token, session);
    this.revokedSessionTokens.delete(data.token);

    if (supabaseRepo.isAvailable()) {
      await supabaseRepo.createSession(data).catch((err) => {
        console.warn("[Database] Supabase createSession warning:", err.message);
      });
    }

    return session;
  }

  public async getSession(token: string): Promise<SessionRecord | null> {
    if (this.revokedSessionTokens.has(token)) return null;

    let session = this.sessions.get(token);
    if (!session && supabaseRepo.isAvailable()) {
      try {
        const remote = await supabaseRepo.getSession(token);
        if (remote && !this.revokedSessionTokens.has(token)) {
          this.sessions.set(token, remote);
          session = remote;
        }
      } catch (err) {
        // Fall through
      }
    }

    if (!session || this.revokedSessionTokens.has(token)) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      this.revokedSessionTokens.add(token);
      if (supabaseRepo.isAvailable()) {
        supabaseRepo.deleteSession(token).catch(() => {});
      }
      return null;
    }

    // Refresh last activity
    session.lastActivityAt = Date.now();
    return session;
  }

  public async deleteSession(token: string): Promise<boolean> {
    this.revokedSessionTokens.add(token);
    this.sessions.delete(token);
    if (supabaseRepo.isAvailable()) {
      try {
        await supabaseRepo.deleteSession(token);
      } catch (err) {
        // Fall through
      }
    }
    return true;
  }

  public async deleteUserSessions(userId: string): Promise<void> {
    for (const [token, sess] of this.sessions.entries()) {
      if (sess.userId === userId) {
        this.revokedSessionTokens.add(token);
        this.sessions.delete(token);
      }
    }
    if (supabaseRepo.isAvailable()) {
      await supabaseRepo.deleteUserSessions(userId).catch(() => {});
    }
  }

  // SETTINGS
  public async getUserSettings(userId: string): Promise<UserSettingsRecord> {
    let settings = this.userSettings.get(userId);
    if (!settings && supabaseRepo.isAvailable()) {
      try {
        settings = await supabaseRepo.getUserSettings(userId);
        this.userSettings.set(userId, settings);
      } catch (err) {
        // Fall through
      }
    }
    if (!settings) {
      settings = {
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
      this.userSettings.set(userId, settings);
    }
    return settings;
  }

  public async updateUserSettings(userId: string, updates: Partial<UserSettingsRecord>): Promise<UserSettingsRecord> {
    const current = await this.getUserSettings(userId);
    const updated: UserSettingsRecord = {
      ...current,
      ...updates,
      userId,
      updatedAt: Date.now(),
    };
    this.userSettings.set(userId, updated);
    if (supabaseRepo.isAvailable()) {
      supabaseRepo.updateUserSettings(userId, updates).catch(() => {});
    }
    return updated;
  }

  // WORKSPACES (User-scoped authorization)
  public async createWorkspace(data: {
    userId: string;
    name: string;
    description?: string;
    icon?: string;
    customInstructions?: string;
    isDefault?: boolean;
  }): Promise<WorkspaceRecord> {
    const now = Date.now();
    const ws: WorkspaceRecord = {
      id: generateSecureId("ws"),
      userId: data.userId,
      name: data.name,
      description: data.description || "",
      icon: data.icon || "Folder",
      customInstructions: data.customInstructions || "",
      isDefault: Boolean(data.isDefault),
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.set(ws.id, ws);
    this.addToIndex(this.userWorkspacesIndex, data.userId, ws.id);

    if (supabaseRepo.isAvailable()) {
      supabaseRepo.createWorkspace(data).catch((err) => {
        console.warn("[Database] Supabase createWorkspace warning:", err.message);
      });
    }

    return ws;
  }

  public async listWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    const wsIds = this.userWorkspacesIndex.get(userId);
    if (!wsIds || wsIds.size === 0) {
      if (supabaseRepo.isAvailable()) {
        try {
          const remoteList = await supabaseRepo.listWorkspaces(userId);
          for (const ws of remoteList) {
            this.workspaces.set(ws.id, ws);
            this.addToIndex(this.userWorkspacesIndex, userId, ws.id);
          }
          return remoteList;
        } catch (err) {
          // Fall through
        }
      }
      return [];
    }
    const result: WorkspaceRecord[] = [];
    for (const id of wsIds) {
      const ws = this.workspaces.get(id);
      if (ws && ws.userId === userId) {
        result.push(ws);
      }
    }
    return result;
  }

  public async getWorkspace(userId: string, workspaceId: string): Promise<WorkspaceRecord | null> {
    let ws = this.workspaces.get(workspaceId);
    if (!ws && supabaseRepo.isAvailable()) {
      try {
        const remote = await supabaseRepo.getWorkspace(userId, workspaceId);
        if (remote) {
          this.workspaces.set(remote.id, remote);
          this.addToIndex(this.userWorkspacesIndex, userId, remote.id);
          ws = remote;
        }
      } catch (err) {
        // Fall through
      }
    }
    if (!ws || ws.userId !== userId) {
      return null; // Enforces user authorization
    }
    return ws;
  }

  public async deleteWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws || ws.userId !== userId) {
      return false;
    }
    if (ws.isDefault) {
      throw new Error("Cannot delete default workspace.");
    }
    this.removeFromIndex(this.userWorkspacesIndex, userId, workspaceId);
    if (supabaseRepo.isAvailable()) {
      supabaseRepo.deleteWorkspace(userId, workspaceId).catch(() => {});
    }
    return this.workspaces.delete(workspaceId);
  }

  // CONVERSATIONS (User-scoped authorization)
  public async listConversations(userId: string, workspaceId?: string): Promise<ConversationRecord[]> {
    const convIds = this.userConversationsIndex.get(userId);
    if (!convIds || convIds.size === 0) {
      if (supabaseRepo.isAvailable()) {
        try {
          const remoteList = await supabaseRepo.listConversations(userId, workspaceId);
          for (const c of remoteList) {
            this.conversations.set(c.id, c);
            this.addToIndex(this.userConversationsIndex, userId, c.id);
          }
          return remoteList;
        } catch (err) {
          // Fall through
        }
      }
      return [];
    }
    const list: ConversationRecord[] = [];
    for (const id of convIds) {
      const c = this.conversations.get(id);
      if (c && c.userId === userId) {
        if (!workspaceId || c.workspaceId === workspaceId) {
          list.push(c);
        }
      }
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async getConversation(userId: string, conversationId: string): Promise<ConversationRecord | null> {
    let c = this.conversations.get(conversationId);
    if (!c && supabaseRepo.isAvailable()) {
      try {
        const remote = await supabaseRepo.getConversation(userId, conversationId);
        if (remote) {
          this.conversations.set(remote.id, remote);
          this.addToIndex(this.userConversationsIndex, userId, remote.id);
          c = remote;
        }
      } catch (err) {
        // Fall through
      }
    }
    if (!c || c.userId !== userId) {
      return null; // Prevents cross-user ID traversal
    }
    return c;
  }

  public async saveConversation(userId: string, data: Partial<ConversationRecord> & { id?: string }): Promise<ConversationRecord> {
    const now = Date.now();
    const id = data.id || generateSecureId("conv");

    const existing = this.conversations.get(id);
    if (existing && existing.userId !== userId) {
      throw new Error("Unauthorized to modify this conversation.");
    }

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

    this.conversations.set(id, record);
    this.addToIndex(this.userConversationsIndex, userId, id);

    if (supabaseRepo.isAvailable()) {
      supabaseRepo.saveConversation(userId, record).catch((err) => {
        console.warn("[Database] Supabase saveConversation warning:", err.message);
      });
    }

    return record;
  }

  public async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const c = this.conversations.get(conversationId);
    if (!c || c.userId !== userId) {
      return false;
    }
    this.removeFromIndex(this.userConversationsIndex, userId, conversationId);
    if (supabaseRepo.isAvailable()) {
      supabaseRepo.deleteConversation(userId, conversationId).catch(() => {});
    }
    return this.conversations.delete(conversationId);
  }

  public async clearUserConversations(userId: string): Promise<number> {
    const convIds = this.userConversationsIndex.get(userId);
    if (!convIds) return 0;
    let count = 0;
    for (const id of Array.from(convIds)) {
      this.conversations.delete(id);
      count++;
    }
    this.userConversationsIndex.delete(userId);
    if (supabaseRepo.isAvailable()) {
      supabaseRepo.clearUserConversations(userId).catch(() => {});
    }
    return count;
  }

  // MEMORIES (User-scoped authorization)
  public async listMemories(userId: string): Promise<MemoryRecord[]> {
    const memIds = this.userMemoriesIndex.get(userId);
    if (!memIds || memIds.size === 0) {
      if (supabaseRepo.isAvailable()) {
        try {
          const remoteList = await supabaseRepo.listMemories(userId);
          for (const m of remoteList) {
            this.memories.set(m.id, m);
            this.addToIndex(this.userMemoriesIndex, userId, m.id);
          }
          return remoteList;
        } catch (err) {
          // Fall through
        }
      }
      return [];
    }
    const result: MemoryRecord[] = [];
    for (const id of memIds) {
      const m = this.memories.get(id);
      if (m && m.userId === userId) {
        result.push(m);
      }
    }
    return result;
  }

  public async createMemory(userId: string, data: { content: string; category: "preference" | "fact" | "instruction"; workspaceId?: string }): Promise<MemoryRecord> {
    const memory: MemoryRecord = {
      id: generateSecureId("mem"),
      userId,
      workspaceId: data.workspaceId,
      content: data.content,
      category: data.category,
      createdAt: Date.now(),
    };
    this.memories.set(memory.id, memory);
    this.addToIndex(this.userMemoriesIndex, userId, memory.id);

    if (supabaseRepo.isAvailable()) {
      supabaseRepo.createMemory(userId, data).catch((err) => {
        console.warn("[Database] Supabase createMemory warning:", err.message);
      });
    }

    return memory;
  }

  public async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const m = this.memories.get(memoryId);
    if (!m || m.userId !== userId) {
      return false;
    }
    this.removeFromIndex(this.userMemoriesIndex, userId, memoryId);
    if (supabaseRepo.isAvailable()) {
      supabaseRepo.deleteMemory(userId, memoryId).catch(() => {});
    }
    return this.memories.delete(memoryId);
  }

  public async clearUserMemories(userId: string): Promise<number> {
    const memIds = this.userMemoriesIndex.get(userId);
    if (!memIds) return 0;
    let count = 0;
    for (const id of Array.from(memIds)) {
      this.memories.delete(id);
      count++;
    }
    this.userMemoriesIndex.delete(userId);
    if (supabaseRepo.isAvailable()) {
      supabaseRepo.clearUserMemories(userId).catch(() => {});
    }
    return count;
  }

  // ATTACHMENTS (Secure server registry)
  public async recordAttachment(data: {
    userId: string;
    originalName: string;
    storageName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<AttachmentRecord> {
    const record: AttachmentRecord = {
      id: generateSecureId("att"),
      userId: data.userId,
      originalName: data.originalName,
      storageName: data.storageName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      createdAt: Date.now(),
    };
    this.attachments.set(record.id, record);

    if (supabaseRepo.isAvailable()) {
      supabaseRepo.recordAttachment(data).catch((err) => {
        console.warn("[Database] Supabase recordAttachment warning:", err.message);
      });
    }

    return record;
  }

  public async getAttachment(userId: string, attachmentId: string): Promise<AttachmentRecord | null> {
    let att = this.attachments.get(attachmentId);
    if (!att && supabaseRepo.isAvailable()) {
      try {
        const remote = await supabaseRepo.getAttachment(userId, attachmentId);
        if (remote) {
          this.attachments.set(remote.id, remote);
          att = remote;
        }
      } catch (err) {
        // Fall through
      }
    }
    if (!att || att.userId !== userId) {
      return null;
    }
    return att;
  }

  public getAttachmentById(attachmentId: string): AttachmentRecord | undefined {
    return this.attachments.get(attachmentId);
  }

  // BACKUP EXPORT / RESTORE
  public async exportUserData(userId: string): Promise<Record<string, any>> {
    const user = await this.findUserById(userId);
    const workspaces = await this.listWorkspaces(userId);
    const conversations = await this.listConversations(userId);
    const memories = await this.listMemories(userId);

    return {
      version: "4.0.0",
      exportedAt: new Date().toISOString(),
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        : null,
      workspaces,
      conversations,
      memories,
    };
  }

  // DAILY USAGE LIMITS & SUBSCRIPTIONS SYSTEM
  public async setUserTier(userId: string, tier: UserPlan): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.tier = tier;
      user.updatedAt = Date.now();
    }
  }

  /**
   * Resolves the authoritative active tier for a user.
   * Priority:
   * 1. Guest -> "guest"
   * 2. Active subscription within current period -> subscription.plan
   * 3. Expired/past-due subscription -> automatically marked expired, defaults to "free"
   * 4. User.tier override (handling "premium" -> "ultra")
   * 5. Default "free"
   */
  public async getUserEffectiveTier(userId: string): Promise<UserPlan> {
    const user = this.users.get(userId);
    if (!user || user.isGuest) {
      return "guest";
    }

    const subId = this.userSubscriptionIndex.get(userId);
    if (subId) {
      const sub = this.subscriptions.get(subId);
      if (sub) {
        const now = Date.now();

        // Check if subscription has active state
        if (sub.status === "active") {
          // Check expiration
          if (sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
            sub.status = "expired";
            sub.updatedAt = now;
            return "free";
          }
          // Active and within period: map pro subscription to 300-quota tier
          if (sub.plan === "pro") {
            return "premium";
          }
          return sub.plan;
        }

        // Pending, cancelled, past_due, expired, free -> fallback to free
        return "free";
      }
    }

    if (user.tier) {
      return user.tier;
    }

    return "free";
  }

  // SUBSCRIPTION REPOSITORY METHODS
  public async getSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
    if (supabaseRepo.isAvailable()) {
      try {
        const remote = await supabaseRepo.getSubscriptionByUserId(userId);
        if (remote) {
          this.subscriptions.set(remote.subscriptionId, remote);
          this.userSubscriptionIndex.set(userId, remote.subscriptionId);
          if (remote.providerSubscriptionId) {
            this.providerSubIndex.set(remote.providerSubscriptionId, remote.subscriptionId);
          }
          return remote;
        }
      } catch (err) {
        // Fall through to memory
      }
    }

    const subId = this.userSubscriptionIndex.get(userId);
    let sub = subId ? (this.subscriptions.get(subId) || null) : null;

    if (sub && sub.status === "active" && sub.currentPeriodEnd && Date.now() > sub.currentPeriodEnd) {
      sub.status = "expired";
      sub.updatedAt = Date.now();
      if (supabaseRepo.isAvailable()) {
        await supabaseRepo.saveSubscription(sub).catch(() => {});
      }
    }
    return sub;
  }

  public async getSubscriptionById(subscriptionId: string): Promise<SubscriptionRecord | null> {
    const sub = this.subscriptions.get(subscriptionId) || null;
    if (sub && sub.status === "active" && sub.currentPeriodEnd && Date.now() > sub.currentPeriodEnd) {
      sub.status = "expired";
      sub.updatedAt = Date.now();
    }
    return sub;
  }

  public async getSubscriptionByProviderSubId(providerSubId: string): Promise<SubscriptionRecord | null> {
    const subId = this.providerSubIndex.get(providerSubId);
    if (subId) {
      return this.getSubscriptionById(subId);
    }
    if (supabaseRepo.isAvailable()) {
      try {
        const remote = await supabaseRepo.getSubscriptionByProviderSubId(providerSubId);
        if (remote) {
          this.subscriptions.set(remote.subscriptionId, remote);
          this.providerSubIndex.set(providerSubId, remote.subscriptionId);
          this.userSubscriptionIndex.set(remote.userId, remote.subscriptionId);
          return remote;
        }
      } catch {}
    }
    return null;
  }

  public async createOrUpdateSubscription(data: Partial<SubscriptionRecord> & { userId: string }): Promise<SubscriptionRecord> {
    return this.runWithUserLock(data.userId, async () => {
      const existingSubId = this.userSubscriptionIndex.get(data.userId);
      const now = Date.now();

      if (existingSubId && this.subscriptions.has(existingSubId)) {
        const existing = this.subscriptions.get(existingSubId)!;
        const updated: SubscriptionRecord = {
          ...existing,
          ...data,
          providerSubscriptionId: data.providerSubscriptionId || existing.providerSubscriptionId || "",
          providerCustomerId: data.providerCustomerId || existing.providerCustomerId || "",
          updatedAt: now,
        };
        this.subscriptions.set(existingSubId, updated);
        if (updated.providerSubscriptionId) {
          this.providerSubIndex.set(updated.providerSubscriptionId, existingSubId);
        }
        if (supabaseRepo.isAvailable()) {
          try {
            await supabaseRepo.saveSubscription(updated);
          } catch {}
        }
        return updated;
      }

      const subscriptionId = data.subscriptionId || generateSecureId("sub");
      const record: SubscriptionRecord = {
        subscriptionId,
        userId: data.userId,
        plan: data.plan || "free",
        status: data.status || "free",
        provider: data.provider || "razorpay",
        providerCustomerId: data.providerCustomerId || "",
        providerSubscriptionId: data.providerSubscriptionId || "",
        currentPeriodStart: data.currentPeriodStart || now,
        currentPeriodEnd: data.currentPeriodEnd || now + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
        createdAt: now,
        updatedAt: now,
      };

      this.subscriptions.set(subscriptionId, record);
      this.userSubscriptionIndex.set(data.userId, subscriptionId);
      if (record.providerSubscriptionId) {
        this.providerSubIndex.set(record.providerSubscriptionId, subscriptionId);
      }
      if (supabaseRepo.isAvailable()) {
        try {
          await supabaseRepo.saveSubscription(record);
        } catch {}
      }
      return record;
    });
  }

  public async cancelSubscriptionForUser(userId: string, cancelAtPeriodEnd: boolean = true): Promise<SubscriptionRecord | null> {
    return this.runWithUserLock(userId, async () => {
      const subId = this.userSubscriptionIndex.get(userId);
      if (!subId) return null;
      const sub = this.subscriptions.get(subId);
      if (!sub) return null;

      const now = Date.now();
      if (cancelAtPeriodEnd) {
        sub.cancelAtPeriodEnd = true;
        sub.updatedAt = now;
      } else {
        sub.status = "cancelled";
        sub.cancelAtPeriodEnd = false;
        sub.updatedAt = now;
      }

      if (supabaseRepo.isAvailable()) {
        supabaseRepo.saveSubscription(sub).catch(() => {});
      }

      return sub;
    });
  }

  public isWebhookEventProcessed(eventId: string): boolean {
    return this.processedWebhookEvents.has(eventId);
  }

  public markWebhookEventProcessed(eventId: string): void {
    this.processedWebhookEvents.add(eventId);
  }

  public getTodayUtcDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public async runWithUserLock<T>(userId: string, fn: () => Promise<T> | T): Promise<T> {
    const currentLock = this.userLocks.get(userId) || Promise.resolve();
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.userLocks.set(userId, currentLock.then(() => nextLock));

    try {
      await currentLock;
      return await fn();
    } finally {
      release!();
      if (this.userLocks.get(userId) === nextLock) {
        this.userLocks.delete(userId);
      }
    }
  }

  public async getDailyUsage(userId: string, utcDate: string = this.getTodayUtcDate()): Promise<DailyUsageRecord> {
    return this.runWithUserLock(userId, async () => {
      const key = `${userId}:${utcDate}`;
      let record = this.dailyUsage.get(key);
      if (!record) {
        const now = Date.now();
        record = {
          id: generateSecureId("usg"),
          userId,
          utcDate,
          messagesUsed: 0,
          imagesUsed: 0,
          searchesUsed: 0,
          filesUsed: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.dailyUsage.set(key, record);
        this.addToIndex(this.userDailyUsageIndex, userId, record.id);
      }
      return { ...record };
    });
  }

  public async reserveUsage(
    userId: string,
    plan: UserPlan,
    resource: LimitResource,
    utcDate: string = this.getTodayUtcDate()
  ): Promise<LimitReservationResult> {
    return this.runWithUserLock(userId, async () => {
      const limits = getDailyLimitsForPlan(plan);
      const limit = limits[resource];
      const key = `${userId}:${utcDate}`;
      let record = this.dailyUsage.get(key);
      if (!record) {
        const now = Date.now();
        record = {
          id: generateSecureId("usg"),
          userId,
          utcDate,
          messagesUsed: 0,
          imagesUsed: 0,
          searchesUsed: 0,
          filesUsed: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.dailyUsage.set(key, record);
        this.addToIndex(this.userDailyUsageIndex, userId, record.id);
      }

      const fieldMap: Record<LimitResource, "messagesUsed" | "imagesUsed" | "searchesUsed" | "filesUsed"> = {
        messages: "messagesUsed",
        images: "imagesUsed",
        searches: "searchesUsed",
        files: "filesUsed",
      };
      const field = fieldMap[resource];
      const currentUsed = record[field];

      if (currentUsed >= limit) {
        return {
          allowed: false,
          resource,
          plan,
          used: currentUsed,
          limit,
          remaining: 0,
          utcDate,
          errorMessage: "You've reached today's limit. Your limit will reset tomorrow.",
        };
      }

      record[field] = currentUsed + 1;
      record.updatedAt = Date.now();

      if (supabaseRepo.isAvailable()) {
        supabaseRepo.syncDailyUsage(record).catch(() => {});
      }

      return {
        allowed: true,
        resource,
        plan,
        used: record[field],
        limit,
        remaining: Math.max(0, limit - record[field]),
        utcDate,
      };
    });
  }

  public async rollbackUsage(
    userId: string,
    resource: LimitResource,
    utcDate: string = this.getTodayUtcDate()
  ): Promise<void> {
    return this.runWithUserLock(userId, async () => {
      const key = `${userId}:${utcDate}`;
      const record = this.dailyUsage.get(key);
      if (!record) return;

      const fieldMap: Record<LimitResource, "messagesUsed" | "imagesUsed" | "searchesUsed" | "filesUsed"> = {
        messages: "messagesUsed",
        images: "imagesUsed",
        searches: "searchesUsed",
        files: "filesUsed",
      };
      const field = fieldMap[resource];
      if (record[field] > 0) {
        record[field] = record[field] - 1;
        record.updatedAt = Date.now();
        if (supabaseRepo.isAvailable()) {
          supabaseRepo.syncDailyUsage(record).catch(() => {});
        }
      }
    });
  }

  public async setDailyUsageForTest(
    userId: string,
    resource: LimitResource,
    count: number,
    utcDate: string = this.getTodayUtcDate()
  ): Promise<void> {
    return this.runWithUserLock(userId, async () => {
      const key = `${userId}:${utcDate}`;
      let record = this.dailyUsage.get(key);
      if (!record) {
        const now = Date.now();
        record = {
          id: generateSecureId("usg"),
          userId,
          utcDate,
          messagesUsed: 0,
          imagesUsed: 0,
          searchesUsed: 0,
          filesUsed: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.dailyUsage.set(key, record);
        this.addToIndex(this.userDailyUsageIndex, userId, record.id);
      }
      const fieldMap: Record<LimitResource, "messagesUsed" | "imagesUsed" | "searchesUsed" | "filesUsed"> = {
        messages: "messagesUsed",
        images: "imagesUsed",
        searches: "searchesUsed",
        files: "filesUsed",
      };
      record[fieldMap[resource]] = count;
      record.updatedAt = Date.now();
    });
  }

  public async resetDailyUsageForTest(userId: string, utcDate: string = this.getTodayUtcDate()): Promise<void> {
    return this.runWithUserLock(userId, async () => {
      const key = `${userId}:${utcDate}`;
      const record = this.dailyUsage.get(key);
      if (record) {
        record.messagesUsed = 0;
        record.imagesUsed = 0;
        record.searchesUsed = 0;
        record.filesUsed = 0;
        record.updatedAt = Date.now();
      }
    });
  }

  /**
   * Administrative queries - sanitized, server-side only
   */
  public getAllUsers(): Array<Omit<UserRecord, "passwordHash" | "passwordSalt">> {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isGuest: u.isGuest,
      tier: u.tier || "free",
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  public getAllSubscriptions(): SubscriptionRecord[] {
    return Array.from(this.subscriptions.values());
  }

  public getAllDailyUsage(utcDate: string = this.getTodayUtcDate()): DailyUsageRecord[] {
    const results: DailyUsageRecord[] = [];
    for (const [key, record] of this.dailyUsage.entries()) {
      if (key.endsWith(`:${utcDate}`)) {
        results.push(record);
      }
    }
    return results;
  }

  public getDatabaseCounts(): {
    users: number;
    registeredUsers: number;
    subscriptions: number;
    workspaces: number;
    conversations: number;
    memories: number;
    attachments: number;
  } {
    let registeredUsers = 0;
    for (const u of this.users.values()) {
      if (!u.isGuest) registeredUsers++;
    }
    return {
      users: this.users.size,
      registeredUsers,
      subscriptions: this.subscriptions.size,
      workspaces: this.workspaces.size,
      conversations: this.conversations.size,
      memories: this.memories.size,
      attachments: this.attachments.size,
    };
  }
}

export const db = new SecurityDatabase();

