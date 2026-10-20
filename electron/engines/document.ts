import fs from "node:fs";
import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["pdf", "docx", "txt", "html", "htm", "md"];

const TARGETS: Record<string, string[]> = {
  pdf: ["txt", "png", "jpg"],
  docx: ["html", "txt", "md", "pdf"],
  txt: ["html", "pdf", "md"],
  html: ["txt", "md", "pdf"],
  htm: ["txt", "md", "pdf"],
  md: ["html", "txt", "pdf"],
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

  throw new Error(`Conversão ${ext} → ${out} não suportada`);
}

export const documentEngine: ConversionEngine = {
  category: "document",
  label: "Documentos",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
