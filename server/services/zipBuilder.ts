/**
 * RSR Nexora - Pure TypeScript / Node.js ZIP Archive Builder
 * Creates standard PKWARE ZIP archives for DOCX, XLSX, and PPTX OpenXML packages
 * without external npm dependencies.
 */

import zlib from "zlib";

export interface ZipEntry {
  path: string;
  data: Buffer | string;
}

// Standard IEEE 802.3 CRC32 implementation
function calculateCRC32(buffer: Buffer): number {
  if (typeof (zlib as any).crc32 === "function") {
    return (zlib as any).crc32(buffer) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    let byte = buffer[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte ^ crc) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      byte = byte >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class ZipBuilder {
  private entries: ZipEntry[] = [];

  public addFile(path: string, content: Buffer | string): this {
    // Normalize path separators to forward slash
    const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
    this.entries.push({ path: normalized, data: content });
    return this;
  }

  public build(): Buffer {
    const localHeaders: Buffer[] = [];
    const centralHeaders: Buffer[] = [];
    let offset = 0;

    // Use current DOS time
    const now = new Date();
    const dosTime =
      ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate =
      (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    for (const entry of this.entries) {
      const rawData =
        typeof entry.data === "string" ? Buffer.from(entry.data, "utf-8") : entry.data;
      const uncompressedSize = rawData.length;
      const crc32 = calculateCRC32(rawData);

      // Deflate compress data
      let compressedData: Buffer;
      let compressionMethod = 8; // Deflate
      try {
        compressedData = zlib.deflateRawSync(rawData, { level: 6 });
        // If compressed is larger or equal, store raw
        if (compressedData.length >= uncompressedSize) {
          compressedData = rawData;
          compressionMethod = 0; // Store
        }
      } catch {
        compressedData = rawData;
        compressionMethod = 0;
      }
      const compressedSize = compressedData.length;

      const filenameBuf = Buffer.from(entry.path, "utf-8");

      // 1. Local File Header (30 bytes + name)
      const localHdr = Buffer.alloc(30 + filenameBuf.length);
      localHdr.writeUInt32LE(0x04034b50, 0); // Local header signature
      localHdr.writeUInt16LE(20, 4); // Version needed to extract (2.0)
      localHdr.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8)
      localHdr.writeUInt16LE(compressionMethod, 8); // Compression method
      localHdr.writeUInt16LE(dosTime, 10);
      localHdr.writeUInt16LE(dosDate, 12);
      localHdr.writeUInt32LE(crc32, 14);
      localHdr.writeUInt32LE(compressedSize, 18);
      localHdr.writeUInt32LE(uncompressedSize, 22);
      localHdr.writeUInt16LE(filenameBuf.length, 26);
      localHdr.writeUInt16LE(0, 28); // Extra field length
      filenameBuf.copy(localHdr, 30);

      // 2. Central Directory Header (46 bytes + name)
      const centralHdr = Buffer.alloc(46 + filenameBuf.length);
      centralHdr.writeUInt32LE(0x02014b50, 0); // Central header signature
      centralHdr.writeUInt16LE(20, 4); // Version made by (2.0)
      centralHdr.writeUInt16LE(20, 6); // Version needed to extract (2.0)
      centralHdr.writeUInt16LE(0x0800, 8); // General purpose bit flag (UTF-8)
      centralHdr.writeUInt16LE(compressionMethod, 10);
      centralHdr.writeUInt16LE(dosTime, 12);
      centralHdr.writeUInt16LE(dosDate, 14);
      centralHdr.writeUInt32LE(crc32, 16);
      centralHdr.writeUInt32LE(compressedSize, 20);
      centralHdr.writeUInt32LE(uncompressedSize, 24);
      centralHdr.writeUInt16LE(filenameBuf.length, 28);
      centralHdr.writeUInt16LE(0, 30); // Extra field length
      centralHdr.writeUInt16LE(0, 32); // File comment length
      centralHdr.writeUInt16LE(0, 34); // Disk number start
      centralHdr.writeUInt16LE(0, 36); // Internal file attributes
      centralHdr.writeUInt32LE(0, 38); // External file attributes
      centralHdr.writeUInt32LE(offset, 42); // Relative offset of local header
      filenameBuf.copy(centralHdr, 46);

      localHeaders.push(localHdr, compressedData);
      centralHeaders.push(centralHdr);

      offset += localHdr.length + compressedData.length;
    }

    const centralDirOffset = offset;
    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirSize = centralDirBuffer.length;

    // 3. End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4); // Number of this disk
    eocd.writeUInt16LE(0, 6); // Disk where central directory starts
    eocd.writeUInt16LE(this.entries.length, 8); // Total entries on this disk
    eocd.writeUInt16LE(this.entries.length, 10); // Total entries
    eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
    eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
    eocd.writeUInt16LE(0, 20); // Comment length

    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
  }
}

export interface ExtractedZipEntry {
  path: string;
  isDirectory: boolean;
  size: number;
  content?: string; // UTF-8 text if text file
  binary?: Buffer;
}

export class ZipReader {
  public static read(buffer: Buffer): ExtractedZipEntry[] {
    const entries: ExtractedZipEntry[] = [];
    let offset = 0;

    const TEXT_EXTS = new Set([
      ".txt", ".md", ".json", ".js", ".jsx", ".ts", ".tsx",
      ".py", ".html", ".css", ".scss", ".sql", ".sh", ".bash",
      ".yaml", ".yml", ".env", ".xml", ".csv", ".rtf", ".c", ".cpp",
      ".h", ".hpp", ".cs", ".java", ".php", ".rs", ".go"
    ]);

    while (offset <= buffer.length - 30) {
      const sig = buffer.readUInt32LE(offset);
      // Check for local file header signature 0x04034b50
      if (sig !== 0x04034b50) {
        // May have reached central directory or padding
        break;
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);

      const nameStart = offset + 30;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > buffer.length) break;

      const rawPath = buffer.toString("utf-8", nameStart, nameEnd).replace(/\\/g, "/");
      const dataStart = nameEnd + extraLength;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd > buffer.length) break;

      const isDir = rawPath.endsWith("/");
      let fileBuffer: Buffer | null = null;

      if (!isDir && compressedSize > 0) {
        const rawChunk = buffer.subarray(dataStart, dataEnd);
        try {
          if (compressionMethod === 0) {
            fileBuffer = rawChunk;
          } else if (compressionMethod === 8) {
            fileBuffer = zlib.inflateRawSync(rawChunk);
          }
        } catch {
          // If inflation fails, continue gracefully
        }
      }

      const dotIdx = rawPath.lastIndexOf(".");
      const ext = dotIdx !== -1 ? rawPath.slice(dotIdx).toLowerCase() : "";
      const isText = TEXT_EXTS.has(ext);

      entries.push({
        path: rawPath,
        isDirectory: isDir,
        size: uncompressedSize,
        content: fileBuffer && isText ? fileBuffer.toString("utf-8") : undefined,
        binary: fileBuffer || undefined,
      });

      offset = dataEnd;
    }

    return entries;
  }
}
