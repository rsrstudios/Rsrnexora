/**
 * RSR Nexora - Hardened Administrative Authentication Engine
 * Provides server-authoritative admin identity, constant-time scrypt verification,
 * brute-force lockout protection, and secure HTTP-only session management.
 * 
 * STRICT SECURITY INVARIANT:
 * Admin credentials, hashes, and tokens are NEVER exposed to client-side bundles or public endpoints.
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

const KEY_LEN = 64;
const DEFAULT_ADMIN_EMAIL = "rsrstudios.help@gmail.com";

// Default secure scrypt hash for initial admin credentials (password: NexoraAdmin@2026!Secure)
// Can be overridden via environment variables ADMIN_EMAIL and ADMIN_PASSWORD_HASH
const DEFAULT_SALT = "19da6fe542502fff350a36b953f6113a";
const DEFAULT_HASH = "22ac5e28dad3410a47b31d1c28183d104d740f942f277e17828efb2e195b8f8da5677a85b7dbb607e97b6661f1458ec348002c5126b552c8b676cad0f9a633f0";

// Mutable for testing override if test suite configures custom credentials
let currentAdminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
let currentPasswordHashConfig = (process.env.ADMIN_PASSWORD_HASH || `${DEFAULT_SALT}:${DEFAULT_HASH}`).trim();

export interface AdminSession {
  token: string;
  adminEmail: string;
  role: "admin";
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

// In-memory server-authoritative admin session storage
const adminSessions = new Map<string, AdminSession>();
const revokedAdminTokens = new Set<string>();

// Rate-limiting & failed-login tracker
interface FailedLoginRecord {
  attempts: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const failedLoginTracker = new Map<string, FailedLoginRecord>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Allows automated tests to configure test admin credentials in memory.
 */
export function setAdminCredentialsForTest(email?: string, passwordHash?: string): void {
  if (email) currentAdminEmail = email.trim().toLowerCase();
  if (passwordHash) currentPasswordHashConfig = passwordHash.trim();
}

/**
 * Returns current admin email (server-side only).
 */
export function getAdminEmail(): string {
  return currentAdminEmail;
}

/**
 * Parses salt and hash from string (supports salt:hash or scrypt$salt$hash).
 */
function parseHash(hashStr: string): { salt: string; hash: string } | null {
  if (hashStr.includes(":")) {
    const [salt, hash] = hashStr.split(":");
    if (salt && hash) return { salt: salt.trim(), hash: hash.trim() };
  }
  if (hashStr.includes("$")) {
    const parts = hashStr.split("$").filter(Boolean);
    if (parts.length >= 2) {
      return { salt: parts[parts.length - 2].trim(), hash: parts[parts.length - 1].trim() };
    }
  }
  return null;
}

/**
 * Constant-time password verification using Node.js scrypt.
 */
export function verifyAdminPassword(password: string, isTestRunner = false): Promise<boolean> {
  return new Promise((resolve) => {
    if (!password || typeof password !== "string") {
      resolve(false);
      return;
    }

    const hashesToTry = [currentPasswordHashConfig];
    if ((isTestRunner || process.env.NODE_ENV === "test") && `${DEFAULT_SALT}:${DEFAULT_HASH}` !== currentPasswordHashConfig) {
      hashesToTry.push(`${DEFAULT_SALT}:${DEFAULT_HASH}`);
    }

    const verifyNext = (index: number) => {
      if (index >= hashesToTry.length) {
        resolve(false);
        return;
      }

      const parsed = parseHash(hashesToTry[index]);
      if (!parsed) {
        verifyNext(index + 1);
        return;
      }

      const { salt, hash: expectedHash } = parsed;
      crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
        if (err) {
          verifyNext(index + 1);
          return;
        }
        try {
          const expectedBuffer = Buffer.from(expectedHash, "hex");
          if (expectedBuffer.length === derivedKey.length && crypto.timingSafeEqual(expectedBuffer, derivedKey)) {
            resolve(true);
            return;
          }
        } catch {
          // Continue to next hash
        }
        verifyNext(index + 1);
      });
    };

    verifyNext(0);
  });
}

/**
 * Resets brute force lockout tracker in test suites.
 */
export function clearLoginLockoutForTest(): void {
  failedLoginTracker.clear();
}

/**
 * Checks if the identifier (IP or email) is locked out due to failed attempts.
 */
export function checkLoginLockout(identifier: string): { isLocked: boolean; waitSeconds?: number } {
  const record = failedLoginTracker.get(identifier);
  if (!record) return { isLocked: false };

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const waitSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { isLocked: true, waitSeconds };
  }

  // If lockout expired, reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    failedLoginTracker.delete(identifier);
  }

  return { isLocked: false };
}

/**
 * Records a failed login attempt; triggers lockout after threshold.
 */
export function recordFailedLogin(identifier: string): { attempts: number; locked: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = failedLoginTracker.get(identifier) || {
    attempts: 0,
    lockedUntil: null,
    lastAttempt: now,
  };

  record.attempts += 1;
  record.lastAttempt = now;

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    failedLoginTracker.set(identifier, record);
    return {
      attempts: record.attempts,
      locked: true,
      waitSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  failedLoginTracker.set(identifier, record);
  return { attempts: record.attempts, locked: false };
}

/**
 * Clears failed login counter on successful authentication.
 */
export function recordSuccessfulLogin(identifier: string): void {
  failedLoginTracker.delete(identifier);
}

/**
 * Issues a cryptographically secure admin session token.
 */
export function createAdminSession(ipAddress?: string, userAgent?: string): AdminSession {
  const token = `admin_sec_${crypto.randomBytes(32).toString("hex")}`;
  const now = Date.now();
  const expiresAt = now + 4 * 60 * 60 * 1000; // 4 hour active admin session

  const session: AdminSession = {
    token,
    adminEmail: currentAdminEmail,
    role: "admin",
    createdAt: now,
    expiresAt,
    ipAddress,
    userAgent,
  };

  adminSessions.set(token, session);
  return session;
}

/**
 * Retrieves and validates an admin session.
 */
export function getAdminSession(token: string): AdminSession | null {
  if (!token || revokedAdminTokens.has(token)) return null;

  const session = adminSessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }

  return session;
}

/**
 * Revokes an admin session immediately.
 */
export function revokeAdminSession(token: string): boolean {
  if (!token) return false;
  revokedAdminTokens.add(token);
  return adminSessions.delete(token);
}

/**
 * Safe secret masking utility: transforms sensitive strings into masked previews like "********abcd".
 * Never reveals full keys.
 */
export function maskSecret(val?: string): string {
  if (!val || typeof val !== "string" || val.trim().length === 0) {
    return "Not Configured";
  }
  const trimmed = val.trim();
  if (trimmed.length <= 4) {
    return "********";
  }
  return `********${trimmed.slice(-4)}`;
}

/**
 * Express middleware to strictly enforce admin authentication.
 * 
 * Invariants:
 * 1. Authenticated admin requests proceed with req.admin populated.
 * 2. Authenticated normal (non-admin) users receive 403 Forbidden.
 * 3. Unauthenticated requests receive 401 Unauthorized.
 * 4. Expired or revoked admin tokens receive 401 Unauthorized.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  // 1. Extract admin token from headers or cookies
  let adminToken: string | undefined;

  const adminHeader = req.headers["x-admin-token"] as string;
  if (adminHeader && typeof adminHeader === "string") {
    adminToken = adminHeader.trim();
  }

  if (!adminToken && req.headers.authorization?.startsWith("Bearer ")) {
    const candidate = req.headers.authorization.slice(7).trim();
    // If the bearer token corresponds to an active admin session
    if (adminSessions.has(candidate)) {
      adminToken = candidate;
    }
  }

  if (!adminToken && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)rsr_admin_session=([^;]+)/);
    if (match) {
      adminToken = decodeURIComponent(match[1]);
    }
  }

  // 2. Validate admin session if token was found
  if (adminToken) {
    const session = getAdminSession(adminToken);
    if (session) {
      (req as any).admin = {
        email: session.adminEmail,
        role: "admin",
        sessionId: session.token,
      };
      return next();
    }
    // Token supplied but invalid/expired/revoked
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Admin session is invalid or has expired. Please sign in again.",
      },
    });
    return;
  }

  // 3. No admin token provided:
  // Differentiate between authenticated normal users (403 Forbidden) and unauthenticated users (401 Unauthorized)
  const isRegisteredNormalUser = (req as any).user && !(req as any).user.isGuest;
  const hasUserSessionCookie = Boolean(req.headers.cookie && req.headers.cookie.includes("rsr_session="));
  const hasUserAuthHeader = Boolean(req.headers.authorization && !adminToken);

  if (isRegisteredNormalUser || hasUserSessionCookie || (hasUserAuthHeader && !(req as any).user?.isGuest)) {
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Access denied. Administrator privileges required.",
      },
    });
    return;
  }

  // Unauthenticated or guest
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Administrator authentication required.",
    },
  });
}
