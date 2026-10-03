import path from "path";
import crypto from "crypto";

/**
 * Sanitizes user-provided filename:
 * - Strips directory traversal (.. and / and \)
 * - Strips control characters and null bytes
 * - Limits length
 */
export function sanitizeFilename(originalName: string): string {
  if (!originalName || typeof originalName !== "string") {
    return "unnamed_attachment.bin";
  }

  // Normalize Windows-style backslashes to forward slashes before basename
  const normalized = originalName.trim().replace(/\\/g, "/");
  // Remove path separators and special characters
  let base = path.basename(normalized).replace(/[\x00-\x1f\x80-\x9f\\/<>:"|?*;]/g, "");
  
  // Collapse duplicate underscores/dots
  base = base.replace(/\.{2,}/g, ".").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");

  // If name ended up empty or just dots
  if (!base || base === "." || base === ".." || base === "...") {
    base = "unnamed_attachment.bin";
  }

  // Limit to 100 characters max
  if (base.length > 100) {
    const ext = path.extname(base);
    const stem = path.basename(base, ext).slice(0, 90);
    base = `${stem}${ext}`;
  }

  return base;
}

/**
 * Generates an internal server storage filename with random hash.
 */
export function generateStorageFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9_]/g, "");
  const randomKey = crypto.randomBytes(12).toString("hex");
  return `upload_${Date.now()}_${randomKey}${ext ? `.${ext}` : ".bin"}`;
}

/**
 * Normalizes and validates email addresses.
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  // Standard RFC 5322 regex subset
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
  if (!emailRegex.test(trimmed) || trimmed.length > 254) {
    return null;
  }
  return trimmed;
}

/**
 * Strips script tags, javascript: links, and unsafe characters from text.
 */
export function sanitizeUntrustedText(text: string, maxLen: number = 100000): string {
  if (typeof text !== "string") return "";
  let clean = text.slice(0, maxLen);
  // Remove null bytes and control codes (except newline, tab, carriage return)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return clean;
}

/**
 * Neutralizes dangerous script and iframe elements in HTML markup.
 */
export function neutralizeDangerousMarkup(html: string): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, (match) =>
      match.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    )
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, (match) =>
      match.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    )
    .replace(/<script/gi, "&lt;script")
    .replace(/<\/script>/gi, "&lt;/script&gt;")
    .replace(/<iframe/gi, "&lt;iframe")
    .replace(/<\/iframe>/gi, "&lt;/iframe&gt;");
}

/**
 * Validates whether a redirect path is safe against Open Redirect attacks.
 */
export function isSafeRedirectPath(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  // Disallow absolute protocol schemes (http:, https:, javascript:, data:) and protocol-relative URLs (//)
  if (urlStr.startsWith("//") || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(urlStr)) {
    return false;
  }
  // Safe relative paths starting with single slash
  return /^\/[a-zA-Z0-9_\-\/]*$/.test(urlStr);
}

