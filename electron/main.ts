import { app, BrowserWindow, dialog, ipcMain, Menu, shell, session } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { getTargets, findEngine, getCategory, getAllFormats } from "./engines/registry";
import type { EngineHelpers } from "./engines/types";

const isDev = process.argv.includes("--dev");
const DEV_URL = "http://localhost:5173";
const APP_HTML = path.resolve(__dirname, "..", "dist", "index.html");

process.on("uncaughtException", (err) => {
  const msg = `${err.stack || err.message || err}`;
  try {
    dialog.showErrorBox("FileFlow — Erro", msg);
  } catch {}
  fs.writeFileSync(
    path.join(os.tmpdir(), "fileflow-crash.log"),
    `${new Date().toISOString()}\n${msg}\n`,
  );
});

process.on("unhandledRejection", (reason) => {
  const msg = `Unhandled rejection: ${reason}`;
  try {
    dialog.showErrorBox("FileFlow — Erro", msg);
  } catch {}
});

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

  const showTimeout = setTimeout(() => {
    if (win && !win.isVisible()) {
      win.show();
    }
  }, 5000);

  win.once("ready-to-show", () => {
    clearTimeout(showTimeout);
    win?.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  const load = isDev ? win.loadURL(DEV_URL) : win.loadFile(APP_HTML);
  load.catch((err) => {
    const msg = `Falha ao carregar: ${err.message}\nPath: ${APP_HTML}\nExists: ${fs.existsSync(APP_HTML)}`;
    dialog.showErrorBox("FileFlow — Erro ao iniciar", msg);
    clearTimeout(showTimeout);
    win?.show();
  });
}

function tmpPath(ext: string): string {
  return path.join(os.tmpdir(), `fileflow-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const pdfWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { offscreen: true },
  });

  try {
    await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
    });
    return Buffer.from(pdfBuffer);
  } finally {
    pdfWin.destroy();
  }
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

const helpers: EngineHelpers = { tmpPath, htmlToPdf };

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  ipcMain.handle("get-targets", (_e, ext: string) => getTargets(ext));

  ipcMain.handle("get-category", (_e, ext: string) => getCategory(ext));

  ipcMain.handle("get-all-formats", () => getAllFormats());

  ipcMain.handle("convert-file", async (_e, args: { inputPath: string; outputFormat: string }) => {
    const ext = path.extname(args.inputPath).slice(1).toLowerCase();
    const engine = findEngine(ext);
    if (!engine) throw new Error(`Formato ${ext} não suportado`);
    const outputPath = await engine.convert(args.inputPath, args.outputFormat, helpers);
    return { outputPath };
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

  ipcMain.handle("read-file-preview", async (_e, args: { filePath: string; maxSize?: number }) => {
    const maxSize = args.maxSize ?? 400;
    const sharp = (await import("sharp")).default;
    const img = sharp(args.filePath);
    const meta = await img.metadata();
    const w = meta.width ?? maxSize;
    const h = meta.height ?? maxSize;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const buf = await img
      .resize(Math.round(w * scale), Math.round(h * scale), { fit: "inside" })
      .png()
      .toBuffer();
    return {
      dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    };
  });

  ipcMain.handle("read-file-base64", async (_e, args: { filePath: string }) => {
    const buf = fs.readFileSync(args.filePath);
    const ext = path.extname(args.filePath).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
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
