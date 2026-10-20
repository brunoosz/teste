import fs from "node:fs";
import path from "node:path";
import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["epub", "cbz", "mobi", "azw3", "fb2"];

const TARGETS: Record<string, string[]> = {
  epub: ["txt", "html", "pdf"],
  cbz: ["zip", "pdf"],
  mobi: ["txt", "html", "pdf"],
  azw3: ["txt", "html", "pdf"],
  fb2: ["txt", "html", "pdf", "epub"],
};

async function extractEpubText(inputPath: string): Promise<{ text: string; html: string }> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(inputPath);
  const entries = zip.getEntries();

  const htmlFiles = entries
    .filter((e) => /\.(x?html?|xml)$/i.test(e.entryName) && !e.entryName.includes("META-INF"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  let fullHtml = "";
  let fullText = "";

  for (const entry of htmlFiles) {
    const content = entry.getData().toString("utf-8");
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : content;
    fullHtml += body + "\n";

    const text = body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) fullText += text + "\n\n";
  }

  return { text: fullText.trim(), html: fullHtml };
}

function wrapHtmlDoc(body: string, title = "E-book"): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #1a1a1a; font-size: 16px; }
  h1 { font-size: 28px; margin-top: 2em; } h2 { font-size: 22px; margin-top: 1.5em; } h3 { font-size: 18px; }
  p { margin: 0.8em 0; }
  img { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}

async function convertCbzToPdf(inputPath: string, helpers: EngineHelpers): Promise<string> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(inputPath);
  const entries = zip.getEntries()
    .filter((e) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  if (entries.length === 0) throw new Error("Nenhuma imagem encontrada no CBZ");

  const images = entries.map((e) => {
    const buf = e.getData();
    const ext = path.extname(e.entryName).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  });

  const html = wrapHtmlDoc(
    images.map((src) => `<div style="page-break-after:always;text-align:center"><img src="${src}" style="max-width:100%;max-height:95vh;object-fit:contain"></div>`).join("\n"),
    "CBZ"
  );

  if (!helpers.htmlToPdf) throw new Error("htmlToPdf não disponível");
  const pdfBuf = await helpers.htmlToPdf(html);
  const outPath = helpers.tmpPath("pdf");
  fs.writeFileSync(outPath, pdfBuf);
  return outPath;
}

async function extractMobiText(inputPath: string): Promise<{ text: string; html: string }> {
  const buf = fs.readFileSync(inputPath);

  if (buf.length < 78) throw new Error("Arquivo MOBI/AZW3 inválido");

  const numRecords = buf.readUInt16BE(76);
  const records: number[] = [];
  for (let i = 0; i < numRecords && 78 + i * 8 + 4 <= buf.length; i++) {
    records.push(buf.readUInt32BE(78 + i * 8));
  }

  if (records.length < 2) throw new Error("Arquivo MOBI/AZW3 corrompido");

  const rec0Start = records[0];
  const compression = buf.readUInt16BE(rec0Start);
  const textRecordCount = buf.readUInt16BE(rec0Start + 8);

  const chunks: Buffer[] = [];
  for (let i = 1; i <= textRecordCount && i < records.length; i++) {
    const start = records[i];
    const end = i + 1 < records.length ? records[i + 1] : buf.length;
    let chunk: Buffer = Buffer.from(buf.subarray(start, end)) as Buffer;

    if (compression === 2) {
      chunk = palmDocDecompress(chunk);
    } else if (compression === 17480) {
      try {
        const zlib = require("node:zlib") as typeof import("node:zlib");
        chunk = zlib.inflateSync(chunk);
      } catch {
        // fallback: use raw
      }
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  const text = raw.replace(/\0/g, "").replace(/[^\x20-\x7E\n\t\r -￿]/g, "").trim();
  const isHtml = /<(html|body|p|div|h[1-6])\b/i.test(text);

  if (isHtml) {
    const stripped = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { text: stripped, html: text };
  }

  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  return { text, html: `<p>${escaped}</p>` };
}

function palmDocDecompress(data: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const byte = data[i++];
    if (byte === 0) {
      out.push(0);
    } else if (byte >= 1 && byte <= 8) {
      for (let j = 0; j < byte && i < data.length; j++) {
        out.push(data[i++]);
      }
    } else if (byte >= 0x80) {
      if (i >= data.length) break;
      const next = data[i++];
      const dist = ((byte << 8) | next) >> 3 & 0x7ff;
      const len = (next & 0x07) + 3;
      for (let j = 0; j < len; j++) {
        const pos = out.length - dist;
        out.push(pos >= 0 ? out[pos] : 0);
      }
    } else if (byte >= 0x09 && byte <= 0x7f) {
      out.push(byte);
    } else {
      const space = byte ^ 0x80;
      out.push(0x20);
      out.push(space);
    }
  }
  return Buffer.from(out);
}

async function extractFb2(inputPath: string): Promise<{ text: string; html: string }> {
  let content = fs.readFileSync(inputPath, "utf-8");

  if (content.charCodeAt(0) === 0x1f || content[0] === "\x1f") {
    const zlib = require("node:zlib") as typeof import("node:zlib");
    const buf = fs.readFileSync(inputPath);
    content = zlib.gunzipSync(buf).toString("utf-8");
  }

  const sections: string[] = [];
  const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  while ((m = sectionRegex.exec(content)) !== null) {
    sections.push(m[1]);
  }

  if (sections.length === 0) {
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) sections.push(bodyMatch[1]);
  }

  const rawHtml = sections.join("\n");
  const text = rawHtml
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/gi, (_, t) => "\n## " + t.replace(/<[^>]+>/g, "").trim() + "\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => t.replace(/<[^>]+>/g, "").trim() + "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const html = rawHtml
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/gi, (_, t) => `<h2>${t.replace(/<[^>]+>/g, "").trim()}</h2>`)
    .replace(/<emphasis>/gi, "<em>")
    .replace(/<\/emphasis>/gi, "</em>")
    .replace(/<strong>/gi, "<strong>")
    .replace(/<\/strong>/gi, "</strong>");

  return { text, html };
}

async function convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string> {
  const ext = inputPath.split(".").pop()!.toLowerCase();
  const out = outputFormat.toLowerCase();
  const outPath = helpers.tmpPath(out);

  if (ext === "epub") {
    const { text, html } = await extractEpubText(inputPath);

    if (out === "txt") {
      fs.writeFileSync(outPath, text, "utf-8");
      return outPath;
    }
    if (out === "html") {
      fs.writeFileSync(outPath, wrapHtmlDoc(html), "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(html));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "cbz") {
    if (out === "zip") {
      fs.copyFileSync(inputPath, outPath);
      return outPath;
    }
    if (out === "pdf") {
      return convertCbzToPdf(inputPath, helpers);
    }
  }

  if (ext === "mobi" || ext === "azw3") {
    const { text, html } = await extractMobiText(inputPath);

    if (out === "txt") {
      fs.writeFileSync(outPath, text, "utf-8");
      return outPath;
    }
    if (out === "html") {
      fs.writeFileSync(outPath, wrapHtmlDoc(html), "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(html));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "fb2") {
    const { text, html } = await extractFb2(inputPath);

    if (out === "txt") {
      fs.writeFileSync(outPath, text, "utf-8");
      return outPath;
    }
    if (out === "html") {
      fs.writeFileSync(outPath, wrapHtmlDoc(html), "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(html));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
    if (out === "epub") {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile("mimetype", Buffer.from("application/epub+zip"));
      zip.addFile("META-INF/container.xml", Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
      ));
      const htmlContent = wrapHtmlDoc(html);
      zip.addFile("chapter.xhtml", Buffer.from(htmlContent, "utf-8"));
      zip.addFile("content.opf", Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">fb2-convert</dc:identifier><dc:title>Documento</dc:title><dc:language>pt</dc:language></metadata><manifest><item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch"/></spine></package>`
      ));
      zip.writeZip(outPath);
      return outPath;
    }
  }

  throw new Error(`Conversão ${ext} → ${out} não suportada`);
}

export const ebookEngine: ConversionEngine = {
  category: "ebook",
  label: "E-books",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
