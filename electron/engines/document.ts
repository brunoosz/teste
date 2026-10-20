import fs from "node:fs";
import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["pdf", "docx", "doc", "pptx", "txt", "html", "htm", "md", "rtf"];

const TARGETS: Record<string, string[]> = {
  pdf: ["txt", "png", "jpg"],
  docx: ["html", "txt", "md", "pdf"],
  doc: ["txt", "pdf"],
  pptx: ["txt", "html", "pdf"],
  txt: ["html", "pdf", "md"],
  html: ["txt", "md", "pdf"],
  htm: ["txt", "md", "pdf"],
  md: ["html", "txt", "pdf"],
  rtf: ["txt", "html", "pdf"],
};

function stripHtml(html: string): string {
  return html
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
}

function wrapHtmlDoc(body: string, title = "Documento"): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #1a1a1a; font-size: 15px; }
  h1 { font-size: 24px; } h2 { font-size: 20px; } h3 { font-size: 17px; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 13px; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
</style>
</head>
<body>${body}</body>
</html>`;
}

async function readDocx(inputPath: string): Promise<{ html: string; text: string }> {
  const mammoth = await import("mammoth");
  const buf = fs.readFileSync(inputPath);
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ buffer: buf }),
    mammoth.extractRawText({ buffer: buf }),
  ]);
  return { html: htmlResult.value, text: textResult.value };
}

async function htmlToMarkdown(html: string): Promise<string> {
  const TurndownService = (await import("turndown")).default;
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  return td.turndown(html);
}

async function markdownToHtml(md: string): Promise<string> {
  const { marked } = await import("marked");
  return await marked(md);
}

async function convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string> {
  const ext = inputPath.split(".").pop()!.toLowerCase();
  const out = outputFormat.toLowerCase();
  const outPath = helpers.tmpPath(out);

  if (ext === "pdf") {
    if (out === "txt") {
      const pdfParse = (await import("pdf-parse")).default;
      const buf = fs.readFileSync(inputPath);
      const data = await pdfParse(buf);
      fs.writeFileSync(outPath, data.text, "utf-8");
      return outPath;
    }
    if (out === "png" || out === "jpg") {
      const sharp = (await import("sharp")).default;
      const buf = fs.readFileSync(inputPath);
      const imgPath = helpers.tmpPath(out);
      let pipeline = sharp(buf);
      if (out === "jpg") pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 92 });
      else pipeline = pipeline.png();
      await pipeline.toFile(imgPath);
      return imgPath;
    }
  }

  if (ext === "docx") {
    const { html, text } = await readDocx(inputPath);
    if (out === "html") {
      fs.writeFileSync(outPath, wrapHtmlDoc(html), "utf-8");
      return outPath;
    }
    if (out === "txt") {
      fs.writeFileSync(outPath, text, "utf-8");
      return outPath;
    }
    if (out === "md") {
      const md = await htmlToMarkdown(html);
      fs.writeFileSync(outPath, md, "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const fullHtml = wrapHtmlDoc(html);
      const pdfBuf = await helpers.htmlToPdf(fullHtml);
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "txt") {
    const content = fs.readFileSync(inputPath, "utf-8");
    if (out === "html") {
      const escaped = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      fs.writeFileSync(outPath, wrapHtmlDoc(`<pre>${escaped}</pre>`), "utf-8");
      return outPath;
    }
    if (out === "md") {
      fs.writeFileSync(outPath, content, "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const escaped = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(`<pre>${escaped}</pre>`));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "html" || ext === "htm") {
    const content = fs.readFileSync(inputPath, "utf-8");
    if (out === "txt") {
      fs.writeFileSync(outPath, stripHtml(content), "utf-8");
      return outPath;
    }
    if (out === "md") {
      const md = await htmlToMarkdown(content);
      fs.writeFileSync(outPath, md, "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const pdfBuf = await helpers.htmlToPdf(content);
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "md") {
    const content = fs.readFileSync(inputPath, "utf-8");
    if (out === "html") {
      const htmlBody = await markdownToHtml(content);
      fs.writeFileSync(outPath, wrapHtmlDoc(htmlBody), "utf-8");
      return outPath;
    }
    if (out === "txt") {
      const htmlBody = await markdownToHtml(content);
      fs.writeFileSync(outPath, stripHtml(htmlBody), "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const htmlBody = await markdownToHtml(content);
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(htmlBody));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "pptx") {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(inputPath);
    const slideEntries = zip.getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    let allText = "";
    let allHtml = "";
    let slideNum = 0;

    for (const entry of slideEntries) {
      slideNum++;
      const xml = entry.getData().toString("utf-8");
      const texts: string[] = [];
      const regex = /<a:t>([^<]*)<\/a:t>/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(xml)) !== null) {
        if (m[1].trim()) texts.push(m[1]);
      }
      const slideText = texts.join(" ");
      if (slideText) {
        allText += `--- Slide ${slideNum} ---\n${slideText}\n\n`;
        allHtml += `<h3>Slide ${slideNum}</h3><p>${slideText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>\n`;
      }
    }

    if (out === "txt") {
      fs.writeFileSync(outPath, allText.trim(), "utf-8");
      return outPath;
    }
    if (out === "html") {
      fs.writeFileSync(outPath, wrapHtmlDoc(allHtml, "Apresentação"), "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(allHtml, "Apresentação"));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "doc") {
    const buf = fs.readFileSync(inputPath);
    const chunks: string[] = [];
    let i = 0;
    while (i < buf.length - 1) {
      const code = buf[i] | (buf[i + 1] << 8);
      if (code >= 0x20 && code <= 0x7e) {
        chunks.push(String.fromCharCode(code));
      } else if (code === 0x0d || code === 0x0a) {
        chunks.push("\n");
      }
      i += 2;
    }
    let text = chunks.join("")
      .replace(/[^\x20-\x7E\n\t]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text || text.length < 20) {
      const asciiChunks: string[] = [];
      for (let j = 0; j < buf.length; j++) {
        const b = buf[j];
        if (b >= 0x20 && b <= 0x7e) asciiChunks.push(String.fromCharCode(b));
        else if (b === 0x0d || b === 0x0a) asciiChunks.push("\n");
      }
      text = asciiChunks.join("")
        .replace(/[^\x20-\x7E\n\t]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    if (out === "txt") {
      fs.writeFileSync(outPath, text, "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(`<pre>${escaped}</pre>`));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  if (ext === "rtf") {
    const raw = fs.readFileSync(inputPath, "latin1");
    const text = raw
      .replace(/\{\\[^{}]*\}/g, "")
      .replace(/\\par\b/g, "\n")
      .replace(/\\line\b/g, "\n")
      .replace(/\\tab\b/g, "\t")
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\[a-z]+\d*\s?/gi, "")
      .replace(/[{}]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (out === "txt") {
      fs.writeFileSync(outPath, text, "utf-8");
      return outPath;
    }
    if (out === "html") {
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      fs.writeFileSync(outPath, wrapHtmlDoc(`<p>${escaped}</p>`), "utf-8");
      return outPath;
    }
    if (out === "pdf" && helpers.htmlToPdf) {
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const pdfBuf = await helpers.htmlToPdf(wrapHtmlDoc(`<pre>${escaped}</pre>`));
      fs.writeFileSync(outPath, pdfBuf);
      return outPath;
    }
  }

  throw new Error(`Conversão ${ext} → ${out} não suportada`);
}

export const documentEngine: ConversionEngine = {
  category: "document",
  label: "Documentos",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
