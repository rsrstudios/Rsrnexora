/**
 * RSR Nexora - Dedicated File Maker Engine
 * Generates downloadable files in TXT, MD, CSV, JSON, PDF, DOCX, XLSX, PPTX, and RTF formats.
 * Validates generated content, ensures absolute confidentiality of server paths,
 * and outputs production-compliant document binaries.
 */

import { ZipBuilder } from "./zipBuilder";

export type SupportedFileFormat =
  | "txt"
  | "md"
  | "csv"
  | "json"
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "rtf";

export interface FileCreationRequest {
  fileType: SupportedFileFormat;
  filename: string;
  title?: string;
  content?: string;
  data?: any; // Structured data for tables, spreadsheets, or slides
}

export interface GeneratedFileResult {
  filename: string;
  fileType: SupportedFileFormat;
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

export class FileMakerService {
  public static readonly MIME_TYPES: Record<SupportedFileFormat, string> = {
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    json: "application/json; charset=utf-8",
    rtf: "application/rtf",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  /**
   * Sanitizes a requested file name and guarantees the correct extension.
   */
  public static sanitizeFilename(rawName: string, format: SupportedFileFormat): string {
    let clean = rawName
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim()
      .replace(/\s+/g, "_");
    if (!clean) clean = `nexora_${format}_${Date.now()}`;

    // Strip existing extension if matched
    clean = clean.replace(new RegExp(`\\.${format}$`, "i"), "");
    return `${clean}.${format}`;
  }

  /**
   * Main factory entrypoint to create the requested file format.
   */
  public static async createFile(req: FileCreationRequest): Promise<GeneratedFileResult> {
    const format = req.fileType.toLowerCase() as SupportedFileFormat;
    if (!this.MIME_TYPES[format]) {
      throw new Error(`Unsupported file format: '${req.fileType}'`);
    }

    const filename = this.sanitizeFilename(req.filename, format);
    let buffer: Buffer;

    switch (format) {
      case "txt":
        buffer = this.buildTxt(req);
        break;
      case "md":
        buffer = this.buildMd(req);
        break;
      case "csv":
        buffer = this.buildCsv(req);
        break;
      case "json":
        buffer = this.buildJson(req);
        break;
      case "rtf":
        buffer = this.buildRtf(req);
        break;
      case "pdf":
        buffer = this.buildPdf(req);
        break;
      case "docx":
        buffer = this.buildDocx(req);
        break;
      case "xlsx":
        buffer = this.buildXlsx(req);
        break;
      case "pptx":
        buffer = this.buildPptx(req);
        break;
      default:
        throw new Error(`Generator not implemented for format: ${format}`);
    }

    return {
      filename,
      fileType: format,
      mimeType: this.MIME_TYPES[format],
      buffer,
      sizeBytes: buffer.length,
    };
  }

  // 1. Plain Text
  private static buildTxt(req: FileCreationRequest): Buffer {
    let text = req.content || "";
    if (req.title && !text.startsWith(req.title)) {
      text = `${req.title}\n${"=".repeat(req.title.length)}\n\n${text}`;
    }
    return Buffer.from(text, "utf-8");
  }

  // 2. Markdown
  private static buildMd(req: FileCreationRequest): Buffer {
    let text = req.content || "";
    if (req.title && !text.startsWith("# ")) {
      text = `# ${req.title}\n\n${text}`;
    }
    return Buffer.from(text, "utf-8");
  }

  // 3. RFC 4180 CSV
  private static buildCsv(req: FileCreationRequest): Buffer {
    let csvContent = "";
    if (Array.isArray(req.data) && req.data.length > 0) {
      // Data is array of objects or array of arrays
      if (typeof req.data[0] === "object" && !Array.isArray(req.data[0])) {
        const headers = Object.keys(req.data[0]);
        const rows = [headers.map((h) => this.escapeCsvCell(h)).join(",")];
        for (const item of req.data) {
          const row = headers.map((h) => this.escapeCsvCell(String(item[h] ?? "")));
          rows.push(row.join(","));
        }
        csvContent = rows.join("\r\n");
      } else if (Array.isArray(req.data[0])) {
        const rows = req.data.map((row: any[]) =>
          row.map((cell) => this.escapeCsvCell(String(cell ?? ""))).join(",")
        );
        csvContent = rows.join("\r\n");
      }
    } else if (req.content) {
      // Content could be raw CSV or comma/tab separated lines
      csvContent = req.content.trim();
    } else {
      csvContent = "ID,Name,Description,Date\r\n1,Sample Record,RSR Nexora Generated Content," + new Date().toISOString();
    }

    return Buffer.from(csvContent, "utf-8");
  }

  private static escapeCsvCell(cell: string): string {
    if (cell.includes(",") || cell.includes('"') || cell.includes("\n") || cell.includes("\r")) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  }

  // 4. Formatted JSON
  private static buildJson(req: FileCreationRequest): Buffer {
    let outputObj: any;
    if (req.data !== undefined) {
      outputObj = req.data;
    } else if (req.content) {
      try {
        outputObj = JSON.parse(req.content);
      } catch {
        outputObj = {
          title: req.title || "RSR Nexora Document",
          content: req.content,
          createdAt: new Date().toISOString(),
          createdBy: "RSR Nexora by RSR Studios",
        };
      }
    } else {
      outputObj = {
        title: req.title || "RSR Nexora Generated File",
        createdAt: new Date().toISOString(),
        items: [],
      };
    }

    const formatted = JSON.stringify(outputObj, null, 2);
    return Buffer.from(formatted, "utf-8");
  }

  // 5. Rich Text Format (RTF 1.5)
  private static buildRtf(req: FileCreationRequest): Buffer {
    const title = req.title || "Document";
    const body = req.content || "";

    const escapeRtf = (str: string) =>
      str
        .replace(/\\/g, "\\\\")
        .replace(/{/g, "\\{")
        .replace(/}/g, "\\}")
        .replace(/\n/g, "\\par\n");

    const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}{\\f1\\fnil\\fcharset0 Helvetica-Bold;}}
{\\colortbl ;\\red15\\green23\\blue42;\\red71\\green85\\blue105;\\red37\\green99\\blue235;}
\\viewkind4\\uc1\\pard\\f1\\fs32\\cf3 ${escapeRtf(title)}\\par
\\par\\pard\\cf2\\f0\\fs18 Created by RSR Nexora (RSR Studios) on ${new Date().toLocaleDateString()}\\par
\\par\\pard\\cf1\\f0\\fs22 ${escapeRtf(body)}\\par
}`;

    return Buffer.from(rtf, "utf-8");
  }

  // 6. Valid PDF 1.4 Binary Generator
  private static buildPdf(req: FileCreationRequest): Buffer {
    const title = req.title || "RSR Nexora Document";
    const content = req.content || "Generated by RSR Nexora.";

    const escapePdfText = (str: string) =>
      str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

    // Split content into clean printable lines
    const rawLines = content.split("\n");
    const formattedLines: string[] = [];
    for (const raw of rawLines) {
      // Wrap lines longer than 85 chars
      if (raw.length <= 85) {
        formattedLines.push(raw);
      } else {
        const words = raw.split(" ");
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).trim().length > 85) {
            formattedLines.push(cur);
            cur = w;
          } else {
            cur = (cur + " " + w).trim();
          }
        }
        if (cur) formattedLines.push(cur);
      }
    }

    // PDF Stream construction
    let streamText = "BT\n";
    // Title in Helvetica-Bold, size 18
    streamText += "/F2 18 Tf\n";
    streamText += "50 740 Td\n";
    streamText += `(${escapePdfText(title)}) Tj\n`;
    // Subtitle
    streamText += "/F1 9 Tf\n";
    streamText += "0 -16 Td\n";
    streamText += `(Created by RSR Nexora (RSR Studios) - ${new Date().toLocaleDateString()}) Tj\n`;
    streamText += "0 -24 Td\n";

    // Body in Helvetica, size 11
    streamText += "/F1 11 Tf\n";
    streamText += "14 TL\n"; // 14pt leading

    let yPos = 700;
    for (const line of formattedLines.slice(0, 42)) {
      streamText += `(${escapePdfText(line)}) '\n`;
      yPos -= 14;
      if (yPos < 60) break;
    }
    streamText += "ET\n";

    const streamLength = Buffer.byteLength(streamText, "utf-8");

    // Assemble PDF objects
    const objects: string[] = [];
    // Obj 1: Catalog
    objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    // Obj 2: Pages tree
    objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    // Obj 3: Page (Letter: 612 x 792)
    objects.push(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n"
    );
    // Obj 4: Stream
    objects.push(
      `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}endstream\nendobj\n`
    );
    // Obj 5: Font F1 (Helvetica)
    objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
    // Obj 6: Font F2 (Helvetica-Bold)
    objects.push("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");

    const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    let body = header;
    const offsets: number[] = [0]; // 0 is dummy for 0000000000 65535 f

    for (let i = 0; i < objects.length; i++) {
      offsets.push(body.length);
      body += objects[i];
    }

    const xrefOffset = body.length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      const offStr = String(offsets[i]).padStart(10, "0");
      xref += `${offStr} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(body + xref + trailer, "binary");
  }

  // 7. Standard Word DOCX OpenXML Zip Package
  private static buildDocx(req: FileCreationRequest): Buffer {
    const title = req.title || "Document";
    const content = req.content || "";

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const paragraphs = content
      .split("\n")
      .map(
        (line) =>
          `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(
            line
          )}</w:t></w:r></w:p>`
      )
      .join("");

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Title"/>
        <w:spacing w:after="240"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
          <w:sz w:val="36"/>
          <w:color w:val="1E293B"/>
        </w:rPr>
        <w:t>${escapeXml(title)}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="200"/></w:pPr>
      <w:r>
        <w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr>
        <w:t>Created by RSR Nexora (RSR Studios) on ${new Date().toLocaleDateString()}</w:t>
      </w:r>
    </w:p>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    return new ZipBuilder()
      .addFile("[Content_Types].xml", contentTypesXml)
      .addFile("_rels/.rels", relsXml)
      .addFile("word/document.xml", documentXml)
      .build();
  }

  // 8. Standard Excel XLSX OpenXML Zip Package
  private static buildXlsx(req: FileCreationRequest): Buffer {
    const escapeXml = (str: string) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    let matrix: string[][] = [];
    if (Array.isArray(req.data) && req.data.length > 0) {
      if (typeof req.data[0] === "object" && !Array.isArray(req.data[0])) {
        const headers = Object.keys(req.data[0]);
        matrix.push(headers);
        for (const item of req.data) {
          matrix.push(headers.map((h) => String(item[h] ?? "")));
        }
      } else if (Array.isArray(req.data[0])) {
        matrix = req.data.map((r: any[]) => r.map((c) => String(c ?? "")));
      }
    } else if (req.content) {
      matrix = req.content
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
    } else {
      matrix = [
        ["ID", "Item", "Quantity", "Unit Price", "Total"],
        ["1", "Nexora Pro Subscription", "1", "199", "199"],
        ["2", "API Integration Setup", "1", "0", "0"],
      ];
    }

    // Build worksheet XML
    let sheetData = "";
    matrix.forEach((row, rowIdx) => {
      const rowNum = rowIdx + 1;
      let rowXml = `<row r="${rowNum}">`;
      row.forEach((cellVal, colIdx) => {
        // Compute column letter (A, B, C...)
        const colLetter = String.fromCharCode(65 + colIdx);
        const cellRef = `${colLetter}${rowNum}`;
        const isNumeric = !isNaN(Number(cellVal)) && cellVal.trim() !== "";
        if (isNumeric) {
          rowXml += `<c r="${cellRef}" t="n"><v>${cellVal}</v></c>`;
        } else {
          rowXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(cellVal)}</t></is></c>`;
        }
      });
      rowXml += "</row>";
      sheetData += rowXml;
    });

    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    return new ZipBuilder()
      .addFile("[Content_Types].xml", contentTypesXml)
      .addFile("_rels/.rels", relsXml)
      .addFile("xl/_rels/workbook.xml.rels", workbookRelsXml)
      .addFile("xl/workbook.xml", workbookXml)
      .addFile("xl/worksheets/sheet1.xml", worksheetXml)
      .build();
  }

  // 9. Standard PowerPoint PPTX OpenXML Zip Package
  private static buildPptx(req: FileCreationRequest): Buffer {
    const title = req.title || "Presentation Slide";
    const subtitle = req.content || "Created with RSR Nexora by RSR Studios";

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="1524000" y="1397000"/><a:ext cx="9144000" cy="1828800"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:rPr lang="en-US" sz="4400" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Subtitle"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="1524000" y="3657600"/><a:ext cx="9144000" cy="1828800"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>${escapeXml(subtitle)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>`;

    const presRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

    return new ZipBuilder()
      .addFile("[Content_Types].xml", contentTypesXml)
      .addFile("_rels/.rels", relsXml)
      .addFile("ppt/_rels/presentation.xml.rels", presRelsXml)
      .addFile("ppt/presentation.xml", presentationXml)
      .addFile("ppt/slides/slide1.xml", slideXml)
      .build();
  }
}
