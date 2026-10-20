import fs from "node:fs";
import path from "node:path";
import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["epub", "cbz"];

const TARGETS: Record<string, string[]> = {
  epub: ["txt", "html", "pdf"],
  cbz: ["zip", "pdf"],
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

  throw new Error(`Conversão ${ext} → ${out} não suportada`);
}

export const ebookEngine: ConversionEngine = {
  category: "ebook",
  label: "E-books",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
