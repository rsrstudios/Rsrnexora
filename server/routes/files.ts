import { Router } from "express";
import path from "path";
import fs from "fs";
import { filesRateLimiter } from "../middleware/rateLimiter";
import { authenticateSession } from "../middleware/authMiddleware";
import { sanitizeFilename, generateStorageFilename } from "../security/sanitizer";
import { db } from "../db/database";
import { logger } from "../logger/logger";

import { FileMakerService, SupportedFileFormat } from "../services/fileMakerService";
import { ZipReader } from "../services/zipBuilder";

export const filesRouter = Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_EXTRACTED_CHARS = 60000; // 60,000 chars

const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const GENERATED_DIR = path.join(process.cwd(), "storage", "generated");

for (const dir of [UPLOAD_DIR, GENERATED_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
}

const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/javascript",
  "text/typescript",
  "text/x-python",
  "application/x-typescript",
  "application/javascript",
  "text/html",
  "text/css",
  "application/pdf",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const FORBIDDEN_EXTENSIONS = new Set([
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".php",
  ".vbs",
  ".jar",
  ".com",
  ".pif",
  ".scr",
  ".msi",
  ".dll",
  ".so",
]);

// Extract headings safely from text/markdown content
function extractDocumentHeadings(text: string): string[] {
  const headings: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      headings.push(trimmed.replace(/^#+\s*/, "").slice(0, 80));
    } else if (/^[A-Z0-9\s-]{4,40}:$/.test(trimmed)) {
      headings.push(trimmed.replace(/:$/, "").slice(0, 80));
    }
    if (headings.length >= 25) break;
  }
  return headings;
}

filesRouter.use(filesRateLimiter);
filesRouter.use(authenticateSession);

filesRouter.post("/extract", async (req, res, next) => {
  try {
    const { name, mimeType, textContent, dataUrl, size } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({
        error: {
          code: "MISSING_FILENAME",
          message: "A valid file name is required.",
        },
      });
      return;
    }

    // Sanitize filename and prevent path traversal
    const safeName = sanitizeFilename(name);
    const fileExt = path.extname(safeName).toLowerCase();

    if (FORBIDDEN_EXTENSIONS.has(fileExt)) {
      res.status(400).json({
        error: {
          code: "DANGEROUS_FILE_TYPE",
          message: "Executable and binary script files are strictly blocked for security.",
        },
      });
      return;
    }

    const cleanMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "text/plain";
    if (cleanMime && !ALLOWED_MIME_TYPES.has(cleanMime)) {
      res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: `The MIME type '${cleanMime}' is not permitted. Only documents and standard images are accepted.`,
        },
      });
      return;
    }

    if (size && typeof size === "number" && size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "File exceeds 25MB maximum upload limit.",
        },
      });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication session required.",
        },
      });
      return;
    }

    // Atomic reservation of file usage
    const reservation = await db.reserveUsage(user.userId, user.tier, "files");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "files",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    let extractedText = typeof textContent === "string" ? textContent : "";

    // Process base64 dataUrl if textContent wasn't pre-extracted
    if (!extractedText && dataUrl && typeof dataUrl === "string") {
      if (dataUrl.includes(";base64,")) {
        const parts = dataUrl.split(";base64,");
        const base64Data = parts[1];
        if (base64Data) {
          try {
            const buffer = Buffer.from(base64Data, "base64");
            if (buffer.length > MAX_FILE_SIZE) {
              res.status(413).json({
                error: {
                  code: "FILE_TOO_LARGE",
                  message: "Decoded file exceeds maximum allowable size.",
                },
              });
              return;
            }

            if (!cleanMime || cleanMime.startsWith("text/") || cleanMime === "application/json") {
              extractedText = buffer.toString("utf-8");
            } else if (
              cleanMime === "application/zip" ||
              cleanMime === "application/x-zip-compressed" ||
              fileExt === ".zip"
            ) {
              const zipEntries = ZipReader.read(buffer);
              const fileList = zipEntries.map((e) => (e.isDirectory ? `${e.path}/` : `${e.path} (${e.size} bytes)`)).join("\n");
              const textFiles = zipEntries.filter((e) => !e.isDirectory && e.content && e.content.trim().length > 0);
              
              let projectBreakdown = `[PROJECT ARCHIVE STRUCTURE: ${safeName}]\n`;
              projectBreakdown += `Total Files & Folders: ${zipEntries.length}\n\n`;
              projectBreakdown += `--- Project Tree ---\n${fileList}\n\n`;
              projectBreakdown += `--- Key Source Files ---\n`;
              
              for (const tf of textFiles.slice(0, 15)) {
                projectBreakdown += `\n=== File: ${tf.path} ===\n`;
                projectBreakdown += tf.content!.slice(0, 4000);
                if (tf.content!.length > 4000) {
                  projectBreakdown += `\n[...truncated...]`;
                }
                projectBreakdown += `\n`;
              }
              extractedText = projectBreakdown;
            } else if (cleanMime === "application/pdf") {
              // Extract text stream tokens safely without native binaries
              const rawStr = buffer.toString("binary");
              const textMatches = rawStr.match(/\(([^)]+)\)\s*Tj/g) || rawStr.match(/\[([^\]]+)\]\s*TJ/g);
              if (textMatches && textMatches.length > 0) {
                extractedText = textMatches
                  .map((m) => m.replace(/^[(\[]|[)\]]\s*T[jJ]$/g, ""))
                  .filter((t) => t.trim().length > 1)
                  .join(" ");
              } else {
                extractedText = `[PDF Document: ${safeName}] Document structure processed safely for multimodal analysis.`;
              }
            } else if (
              cleanMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
              fileExt === ".docx"
            ) {
              const zipEntries = ZipReader.read(buffer);
              const docXml = zipEntries.find((e) => e.path === "word/document.xml");
              if (docXml && docXml.content) {
                // Strip XML tags to get raw paragraph text
                extractedText = docXml.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              } else {
                extractedText = `[Word Document: ${safeName}] Structure parsed for analysis.`;
              }
            } else if (
              cleanMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
              fileExt === ".xlsx"
            ) {
              const zipEntries = ZipReader.read(buffer);
              const sharedStrings = zipEntries.find((e) => e.path === "xl/sharedStrings.xml");
              if (sharedStrings && sharedStrings.content) {
                const strings = sharedStrings.content.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
                extractedText = `[Excel Spreadsheet: ${safeName}]\nCells:\n` +
                  strings.map((s) => s.replace(/<[^>]+>/g, "")).join(" | ");
              } else {
                extractedText = `[Excel Spreadsheet: ${safeName}] Structure parsed for analysis.`;
              }
            }
          } catch (err: any) {
            logger.warn("Document buffer parsing warning:", { error: err.message, file: safeName });
            extractedText = `[Attachment: ${safeName}]`;
          }
        }
      }
    }

    // Bound extracted text to prevent memory exhaustion
    if (extractedText.length > MAX_EXTRACTED_CHARS) {
      extractedText = extractedText.slice(0, MAX_EXTRACTED_CHARS) + "\n\n[...content truncated for model safety...]";
    }

    // Record server-side attachment registry
    const storageName = generateStorageFilename(safeName);
    const userId = req.user?.userId || "guest";
    await db.recordAttachment({
      userId,
      originalName: safeName,
      storageName,
      mimeType: cleanMime,
      sizeBytes: size || extractedText.length,
    });

    const headings = extractDocumentHeadings(extractedText);

    res.json({
      success: true,
      name: safeName,
      mimeType: cleanMime,
      characterCount: extractedText.length,
      headings,
      textContent: extractedText,
      summaryPreview:
        extractedText.slice(0, 300) + (extractedText.length > 300 ? "..." : ""),
    });
  } catch (err) {
    if (req.user) {
      await db.rollbackUsage(req.user.userId, "files").catch(() => {});
    }
    next(err);
  }
});

// POST /api/files/upload - Upload and store a document or asset securely
filesRouter.post("/upload", async (req, res, next) => {
  try {
    const { name, mimeType, content, dataUrl, size } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({
        error: {
          code: "MISSING_FILENAME",
          message: "A valid file name is required.",
        },
      });
      return;
    }

    const safeName = sanitizeFilename(name);
    const fileExt = path.extname(safeName).toLowerCase();

    if (FORBIDDEN_EXTENSIONS.has(fileExt)) {
      res.status(400).json({
        error: {
          code: "DANGEROUS_FILE_TYPE",
          message: "Executable and binary script files are strictly blocked for security.",
        },
      });
      return;
    }

    const cleanMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "application/octet-stream";
    if (cleanMime !== "application/octet-stream" && !ALLOWED_MIME_TYPES.has(cleanMime)) {
      res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: `The MIME type '${cleanMime}' is not permitted.`,
        },
      });
      return;
    }

    if (size && typeof size === "number" && size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "File exceeds 25MB maximum upload limit.",
        },
      });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication session required.",
        },
      });
      return;
    }

    // Atomic reservation of file usage
    const reservation = await db.reserveUsage(user.userId, user.tier, "files");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "files",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    const storageName = generateStorageFilename(safeName);
    const filePath = path.join(UPLOAD_DIR, storageName);

    let fileBuffer: Buffer;
    if (typeof content === "string") {
      fileBuffer = Buffer.from(content, "utf-8");
    } else if (typeof dataUrl === "string" && dataUrl.includes(";base64,")) {
      const base64Data = dataUrl.split(";base64,")[1];
      fileBuffer = Buffer.from(base64Data, "base64");
    } else {
      fileBuffer = Buffer.from("", "utf-8");
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
      await db.rollbackUsage(user.userId, "files");
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "Payload content exceeds maximum upload limit.",
        },
      });
      return;
    }

    try {
      fs.writeFileSync(filePath, fileBuffer);

      const userId = user.userId;
      const attachment = await db.recordAttachment({
        userId,
        originalName: safeName,
        storageName,
        mimeType: cleanMime,
        sizeBytes: fileBuffer.length,
      });

      res.status(201).json({
        success: true,
        file: {
          id: attachment.id,
          filename: storageName,
          originalName: safeName,
          mimeType: cleanMime,
          sizeBytes: fileBuffer.length,
          uploadedAt: attachment.createdAt,
        },
      });
    } catch (writeErr) {
      await db.rollbackUsage(user.userId, "files");
      throw writeErr;
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/files/create - Dedicated File Maker endpoint
filesRouter.post("/create", async (req, res, next) => {
  try {
    const { fileType, filename, title, content, data } = req.body;

    if (!fileType || typeof fileType !== "string") {
      res.status(400).json({
        error: {
          code: "MISSING_FILE_TYPE",
          message: "A valid file format is required (e.g. pdf, docx, xlsx, pptx, csv, json, txt, md, rtf).",
        },
      });
      return;
    }

    const cleanFormat = fileType.toLowerCase() as SupportedFileFormat;
    if (!FileMakerService.MIME_TYPES[cleanFormat]) {
      res.status(400).json({
        error: {
          code: "UNSUPPORTED_FORMAT",
          message: `The format '${fileType}' is not supported. Supported: txt, md, csv, json, pdf, docx, xlsx, pptx, rtf.`,
        },
      });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication session required.",
        },
      });
      return;
    }

    // Atomic usage reservation for file creation
    const reservation = await db.reserveUsage(user.userId, user.tier, "files");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's file limit. Your limit will reset tomorrow.",
          resource: "files",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    try {
      const generated = await FileMakerService.createFile({
        fileType: cleanFormat,
        filename: typeof filename === "string" && filename.trim() ? filename.trim() : `nexora_${cleanFormat}`,
        title: typeof title === "string" ? title.trim() : undefined,
        content: typeof content === "string" ? content : undefined,
        data,
      });

      const storageName = generateStorageFilename(generated.filename);
      const filePath = path.join(GENERATED_DIR, storageName);
      fs.writeFileSync(filePath, generated.buffer);

      const record = await db.recordAttachment({
        userId: user.userId,
        originalName: generated.filename,
        storageName,
        mimeType: generated.mimeType,
        sizeBytes: generated.sizeBytes,
      });

      logger.info("[FileMaker] Successfully created file", {
        fileType: cleanFormat,
        filename: generated.filename,
        sizeBytes: generated.sizeBytes,
        userId: user.userId,
      });

      res.status(201).json({
        success: true,
        file: {
          id: record.id,
          filename: generated.filename,
          originalName: generated.filename,
          fileType: cleanFormat,
          mimeType: generated.mimeType,
          sizeBytes: generated.sizeBytes,
          downloadUrl: `/api/files/download/${record.id}`,
          createdAt: record.createdAt,
        },
      });
    } catch (genErr: any) {
      await db.rollbackUsage(user.userId, "files");
      logger.error("[FileMaker] Generation error:", { error: genErr.message });
      res.status(500).json({
        error: {
          code: "FILE_GENERATION_FAILED",
          message: genErr.message || "Failed to generate the requested file.",
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/files/download/:id - Download file with proper attachment disposition
filesRouter.get("/download/:id", (req, res) => {
  try {
    const fileId = req.params.id;
    const attachment = db.getAttachmentById(fileId);

    let targetPath: string | null = null;
    let originalName = "downloaded_file";
    let mimeType = "application/octet-stream";

    if (attachment) {
      originalName = attachment.originalName;
      mimeType = attachment.mimeType;

      const pGen = path.join(GENERATED_DIR, attachment.storageName);
      const pUp = path.join(UPLOAD_DIR, attachment.storageName);
      if (fs.existsSync(pGen)) {
        targetPath = pGen;
      } else if (fs.existsSync(pUp)) {
        targetPath = pUp;
      }
    } else {
      // Check if fileId corresponds directly to safe filename in GENERATED_DIR or UPLOAD_DIR
      const safeBasename = path.basename(fileId);
      const pGen = path.join(GENERATED_DIR, safeBasename);
      const pUp = path.join(UPLOAD_DIR, safeBasename);
      if (fs.existsSync(pGen)) {
        targetPath = pGen;
        originalName = safeBasename;
      } else if (fs.existsSync(pUp)) {
        targetPath = pUp;
        originalName = safeBasename;
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "The requested file could not be found or has expired.",
        },
      });
      return;
    }

    // Set secure download headers without leaking internal file paths
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(originalName)}"`
    );
    res.sendFile(targetPath);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "DOWNLOAD_FAILED",
        message: "Failed to download the file.",
      },
    });
  }
});

// GET /api/files/:filename - Safely retrieve stored file
filesRouter.get("/:filename", (req, res) => {
  try {
    const rawFilename = req.params.filename;
    const safeBasename = path.basename(rawFilename);
    const filePath = path.join(UPLOAD_DIR, safeBasename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "The requested file does not exist.",
        },
      });
      return;
    }

    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "FILE_SERVE_FAILED",
        message: "Failed to retrieve the requested file.",
      },
    });
  }
});

