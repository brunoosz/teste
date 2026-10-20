import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["zip", "tar", "gz", "tgz", "rar", "7z"];

const TARGETS: Record<string, string[]> = {
  zip: ["tar", "tgz"],
  tar: ["zip", "tgz"],
  gz: ["zip", "tar"],
  tgz: ["zip", "tar"],
  rar: ["zip", "tar", "tgz"],
  "7z": ["zip", "tar", "tgz"],
};

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `fileflow-archive-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function extractZip(inputPath: string, destDir: string): Promise<void> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(inputPath);
  zip.extractAllTo(destDir, true);
}

async function extractTar(inputPath: string, destDir: string): Promise<void> {
  const tar = await import("tar-stream");
  const { createReadStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const zlib = await import("node:zlib");

  const extract = tar.extract();
  const entries: { name: string; data: Buffer }[] = [];

  extract.on("entry", (header, stream, next) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      if (header.type === "file") {
        entries.push({ name: header.name, data: Buffer.concat(chunks) });
      }
      next();
    });
    stream.resume();
  });

  const input = createReadStream(inputPath);
  const isGz = inputPath.endsWith(".gz") || inputPath.endsWith(".tgz");

  if (isGz) {
    await pipeline(input, zlib.createGunzip(), extract);
  } else {
    await pipeline(input, extract);
  }

  for (const entry of entries) {
    const out = path.join(destDir, entry.name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, entry.data);
  }
}

async function packZip(srcDir: string, outPath: string): Promise<void> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip();

  function addDir(dir: string, base: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name);
      if (entry.isDirectory()) {
        addDir(fullPath, relPath);
      } else {
        zip.addLocalFile(fullPath, path.dirname(relPath));
      }
    }
  }

  addDir(srcDir, "");
  zip.writeZip(outPath);
}

async function packTar(srcDir: string, outPath: string, gzip: boolean): Promise<void> {
  const tar = await import("tar-stream");
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const zlib = await import("node:zlib");

  const pack = tar.pack();

  function addDir(dir: string, base: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name);
      if (entry.isDirectory()) {
        addDir(fullPath, relPath);
      } else {
        const data = fs.readFileSync(fullPath);
        pack.entry({ name: relPath, size: data.length }, data);
      }
    }
  }

  addDir(srcDir, "");
  pack.finalize();

  const output = createWriteStream(outPath);
  if (gzip) {
    await pipeline(pack, zlib.createGzip(), output);
  } else {
    await pipeline(pack, output);
  }
}

async function extractRar(inputPath: string, destDir: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    await exec("unrar", ["x", "-o+", inputPath, destDir + "/"], { timeout: 120_000 });
  } catch {
    try {
      await exec("7z", ["x", `-o${destDir}`, "-y", inputPath], { timeout: 120_000 });
    } catch {
      throw new Error("Nenhum descompactador RAR encontrado. Instale unrar ou 7z.");
    }
  }
}

async function extract7z(inputPath: string, destDir: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    await exec("7z", ["x", `-o${destDir}`, "-y", inputPath], { timeout: 120_000 });
  } catch {
    throw new Error("7z não encontrado. Instale p7zip ou 7-Zip.");
  }
}

async function convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string> {
  const ext = inputPath.split(".").pop()!.toLowerCase();
  const fullName = path.basename(inputPath).toLowerCase();
  const out = outputFormat.toLowerCase();
  const outPath = helpers.tmpPath(out === "tgz" ? "tar.gz" : out);

  const extractDir = tmpDir();

  try {
    if (ext === "zip") {
      await extractZip(inputPath, extractDir);
    } else if (ext === "tar" || ext === "gz" || ext === "tgz" || fullName.endsWith(".tar.gz")) {
      await extractTar(inputPath, extractDir);
    } else if (ext === "rar") {
      await extractRar(inputPath, extractDir);
    } else if (ext === "7z") {
      await extract7z(inputPath, extractDir);
    } else {
      throw new Error(`Formato ${ext} não suportado para extração`);
    }

    if (out === "zip") {
      await packZip(extractDir, outPath);
    } else if (out === "tar") {
      await packTar(extractDir, outPath, false);
    } else if (out === "tgz" || out === "gz") {
      await packTar(extractDir, outPath, true);
    } else {
      throw new Error(`Formato de saída ${out} não suportado`);
    }
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  return outPath;
}

export const archiveEngine: ConversionEngine = {
  category: "archive",
  label: "Compactados",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
