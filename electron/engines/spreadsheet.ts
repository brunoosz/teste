import fs from "node:fs";
import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["xlsx", "csv", "json", "xml", "ods", "tsv"];

const TARGETS: Record<string, string[]> = {
  xlsx: ["csv", "json", "xml", "tsv"],
  csv: ["xlsx", "json", "xml", "tsv"],
  json: ["xlsx", "csv", "xml", "tsv"],
  xml: ["xlsx", "csv", "json", "tsv"],
  ods: ["xlsx", "csv", "json", "xml", "tsv"],
  tsv: ["xlsx", "csv", "json", "xml"],
};

interface Row {
  [key: string]: string | number | boolean | null;
}

async function readXlsx(inputPath: string): Promise<{ headers: string[]; rows: Row[] }> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) return { headers: [], rows: [] };

  const headers: string[] = [];
  const firstRow = ws.getRow(1);
  firstRow.eachCell((cell, col) => {
    headers[col - 1] = String(cell.value ?? `Col${col}`);
  });

  const rows: Row[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Row = {};
    let hasData = false;
    headers.forEach((h, i) => {
      const val = row.getCell(i + 1).value;
      if (val !== null && val !== undefined) hasData = true;
      obj[h] = val as string | number | boolean | null;
    });
    if (hasData) rows.push(obj);
  }
  return { headers, rows };
}

async function readCsv(inputPath: string, delimiter = ","): Promise<{ headers: string[]; rows: Row[] }> {
  const Papa = (await import("papaparse")).default;
  const content = fs.readFileSync(inputPath, "utf-8");
  const result = Papa.parse<Row>(content, { header: true, delimiter, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data };
}

async function readJson(inputPath: string): Promise<{ headers: string[]; rows: Row[] }> {
  const content = fs.readFileSync(inputPath, "utf-8");
  const data = JSON.parse(content);
  const arr: Row[] = Array.isArray(data) ? data : [data];
  const headers = [...new Set(arr.flatMap((r) => Object.keys(r)))];
  return { headers, rows: arr };
}

function readXml(inputPath: string): { headers: string[]; rows: Row[] } {
  const content = fs.readFileSync(inputPath, "utf-8");
  const rows: Row[] = [];
  const headerSet = new Set<string>();

  const rowMatches = content.match(/<row[^>]*>([\s\S]*?)<\/row>/gi) ??
    content.match(/<record[^>]*>([\s\S]*?)<\/record>/gi) ??
    content.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) ?? [];

  for (const rowXml of rowMatches) {
    const obj: Row = {};
    const fieldMatches = rowXml.matchAll(/<(\w+)>([^<]*)<\/\1>/g);
    for (const m of fieldMatches) {
      const key = m[1];
      const val = m[2];
      if (key === "row" || key === "record" || key === "item") continue;
      headerSet.add(key);
      const num = Number(val);
      obj[key] = val === "" ? null : !isNaN(num) && val.trim() !== "" ? num : val;
    }
    if (Object.keys(obj).length > 0) rows.push(obj);
  }
  return { headers: [...headerSet], rows };
}

async function writeXlsx(headers: string[], rows: Row[], outPath: string): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dados");
  ws.addRow(headers);
  for (const row of rows) {
    ws.addRow(headers.map((h) => row[h] ?? ""));
  }
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => {
    col.width = Math.max(12, (col.header?.length ?? 8) + 4);
  });
  await wb.xlsx.writeFile(outPath);
}

function writeCsv(headers: string[], rows: Row[], outPath: string, delimiter = ","): void {
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(delimiter) || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.map(escape).join(delimiter)];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(delimiter));
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
}

function writeJson(rows: Row[], outPath: string): void {
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf-8");
}

function writeXml(headers: string[], rows: Row[], outPath: string): void {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<data>\n';
  for (const row of rows) {
    xml += "  <row>\n";
    for (const h of headers) {
      const val = row[h] ?? "";
      const safe = String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      xml += `    <${h}>${safe}</${h}>\n`;
    }
    xml += "  </row>\n";
  }
  xml += "</data>\n";
  fs.writeFileSync(outPath, xml, "utf-8");
}

async function convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string> {
  const ext = inputPath.split(".").pop()!.toLowerCase();
  const out = outputFormat.toLowerCase();
  const outPath = helpers.tmpPath(out);

  let headers: string[];
  let rows: Row[];

  if (ext === "xlsx" || ext === "ods") {
    ({ headers, rows } = await readXlsx(inputPath));
  } else if (ext === "csv") {
    ({ headers, rows } = await readCsv(inputPath));
  } else if (ext === "tsv") {
    ({ headers, rows } = await readCsv(inputPath, "\t"));
  } else if (ext === "json") {
    ({ headers, rows } = await readJson(inputPath));
  } else if (ext === "xml") {
    ({ headers, rows } = readXml(inputPath));
  } else {
    throw new Error(`Formato ${ext} não suportado`);
  }

  if (out === "xlsx") {
    await writeXlsx(headers, rows, outPath);
  } else if (out === "csv") {
    writeCsv(headers, rows, outPath);
  } else if (out === "tsv") {
    writeCsv(headers, rows, outPath, "\t");
  } else if (out === "json") {
    writeJson(rows, outPath);
  } else if (out === "xml") {
    writeXml(headers, rows, outPath);
  } else {
    throw new Error(`Formato de saída ${out} não suportado`);
  }

  return outPath;
}

export const spreadsheetEngine: ConversionEngine = {
  category: "spreadsheet",
  label: "Planilhas",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
