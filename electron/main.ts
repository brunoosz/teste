import { app, BrowserWindow, dialog, ipcMain, Menu, shell, session } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const isDev = process.argv.includes("--dev");
const DEV_URL = "http://localhost:5173";
const APP_HTML = path.resolve(__dirname, "..", "dist", "index.html");

if (process.platform === "win32") {
  app.setAppUserModelId("com.fileflow.app");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win: BrowserWindow | null = null;

function themeColors(theme: "dark" | "light") {
  return theme === "light"
    ? { bg: "#F3EFE6", symbol: "#111113" }
    : { bg: "#111113", symbol: "#F4F1EA" };
}

function createWindow(): void {
  const colors = themeColors("dark");
  win = new BrowserWindow({
    width: 900,
    height: 660,
    minWidth: 500,
    minHeight: 500,
    show: false,
    title: "FileFlow",
    backgroundColor: colors.bg,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 18, y: 16 },
    titleBarOverlay:
      process.platform === "darwin"
        ? undefined
        : { color: colors.bg, symbolColor: colors.symbol, height: 44 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win?.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) void win.loadURL(DEV_URL);
  else void win.loadFile(APP_HTML);
}

function tmpPath(ext: string): string {
  return path.join(os.tmpdir(), `fileflow-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif", "ico", "avif",
]);

const CONVERSION_MAP: Record<string, string[]> = {};
for (const ext of IMAGE_EXTENSIONS) {
  CONVERSION_MAP[ext] = [...IMAGE_EXTENSIONS].filter((e) => e !== ext).sort();
}
CONVERSION_MAP["pdf"] = ["png", "jpg"];
CONVERSION_MAP["svg"] = ["png", "jpg", "webp"];

function getTargets(ext: string): string[] {
  return CONVERSION_MAP[ext.toLowerCase()] ?? [];
}

async function convertImage(inputPath: string, outputFormat: string): Promise<string> {
  const sharp = (await import("sharp")).default;
  const outPath = tmpPath(outputFormat === "jpg" ? "jpg" : outputFormat);

  let pipeline = sharp(inputPath);

  if (outputFormat === "jpg" || outputFormat === "jpeg") {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 92 });
  } else if (outputFormat === "png") {
    pipeline = pipeline.png();
  } else if (outputFormat === "webp") {
    pipeline = pipeline.webp({ quality: 90 });
  } else if (outputFormat === "gif") {
    pipeline = pipeline.gif();
  } else if (outputFormat === "tiff" || outputFormat === "tif") {
    pipeline = pipeline.tiff();
  } else if (outputFormat === "avif") {
    pipeline = pipeline.avif({ quality: 80 });
  } else if (outputFormat === "bmp") {
    pipeline = pipeline.raw();
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const bmpPath = tmpPath("bmp");
    const sharp2 = (await import("sharp")).default;
    await sharp2(data, { raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 } })
      .toFormat("png")
      .toFile(bmpPath);
    return bmpPath;
  } else if (outputFormat === "ico") {
    pipeline = pipeline.resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();
    const outIco = tmpPath("png");
    await pipeline.toFile(outIco);
    return outIco;
  }

  await pipeline.toFile(outPath);
  return outPath;
}

async function convertPdfToImage(inputPath: string, outputFormat: string): Promise<string> {
  const sharp = (await import("sharp")).default;
  const pdfParse = (await import("pdf-parse")).default;
  const buf = fs.readFileSync(inputPath);
  await pdfParse(buf);

  const outPath = tmpPath(outputFormat);
  await sharp(buf).toFormat(outputFormat as any).toFile(outPath);
  return outPath;
}

async function removeBackground(inputPath: string): Promise<string> {
  const { removeBackground: removeBg } = await import("@imgly/background-removal-node");
  const inputBuf = fs.readFileSync(inputPath);
  const blob = new Blob([inputBuf]);
  const resultBlob = await removeBg(blob);
  const arrayBuf = await resultBlob.arrayBuffer();
  const outPath = tmpPath("png");
  fs.writeFileSync(outPath, Buffer.from(arrayBuf));
  return outPath;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  ipcMain.handle("get-targets", (_e, ext: string) => getTargets(ext));

  ipcMain.handle("convert-file", async (_e, args: { inputPath: string; outputFormat: string }) => {
    const ext = path.extname(args.inputPath).slice(1).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) || ext === "svg") {
      return { outputPath: await convertImage(args.inputPath, args.outputFormat) };
    }
    if (ext === "pdf") {
      return { outputPath: await convertPdfToImage(args.inputPath, args.outputFormat) };
    }
    throw new Error(`Formato ${ext} não suportado`);
  });

  ipcMain.handle("remove-bg", async (_e, args: { inputPath: string }) => {
    return { outputPath: await removeBackground(args.inputPath) };
  });

  ipcMain.handle("pick-file", async (_e, args?: { filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openFile"],
      filters: args?.filters,
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("save-file", async (_e, args: { defaultName: string; sourcePath: string }) => {
    const ext = path.extname(args.defaultName).slice(1);
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath("downloads"), args.defaultName),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.copyFileSync(args.sourcePath, result.filePath);
    shell.showItemInFolder(result.filePath);
    return result.filePath;
  });

  ipcMain.handle("set-theme", (_e, theme: "dark" | "light") => {
    const c = themeColors(theme);
    if (win && process.platform !== "darwin") {
      try {
        win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: 44 });
      } catch {}
    }
    win?.setBackgroundColor(c.bg);
  });

  createWindow();

  if (isDev) {
    win?.webContents.on("before-input-event", (_e, input) => {
      if (input.key === "F12") win?.webContents.toggleDevTools();
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
