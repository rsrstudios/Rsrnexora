import crypto from "crypto";
import { config } from "../config/env";

const SALT_LEN = 16;
const KEY_LEN = 64;

export interface HashResult {
  hash: string;
  salt: string;
}

/**
 * Derives a cryptographic password hash using scrypt and random salt.
 */
export function hashPassword(password: string): Promise<HashResult> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LEN).toString("hex");
    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve({
        hash: derivedKey.toString("hex"),
        salt,
      });
    });
  });
}

/**
 * Verifies a password against a stored hash and salt in constant time.
 */
export function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, (err, derivedKey) => {
      if (err) return reject(err);
      try {
        const storedBuffer = Buffer.from(storedHash, "hex");
        if (storedBuffer.length !== derivedKey.length) {
          resolve(false);
          return;
        }
        const matches = crypto.timingSafeEqual(storedBuffer, derivedKey);
        resolve(matches);
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generates a cryptographically strong random token of specified byte length.
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generates an HMAC-SHA256 signature for token verification.
 */
export function signToken(token: string): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(token).digest("hex");
}

/**
 * Safely generates a unique resource ID (prefixed).
 */
export function generateSecureId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * Validates password complexity against minimum security thresholds.
 */
export function validatePasswordComplexity(password: string): { valid: boolean; reason?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, reason: "Password cannot be empty." };
  }
  if (password.length < 8) {
    return { valid: false, reason: "Password must be at least 8 characters long." };
  }
  if (password.length > 128) {
    return { valid: false, reason: "Password exceeds maximum allowable length of 128 characters." };
  }
  return { valid: true };
}

/**
 * Validates that an email string adheres to strict RFC format.
 */
export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

