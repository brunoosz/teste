import { contextBridge, ipcRenderer } from "electron";

const INVOKE_CHANNELS = [
  "get-targets",
  "get-category",
  "get-all-formats",
  "convert-file",
  "remove-bg",
  "pick-file",
  "save-file",
  "set-theme",
  "read-file-preview",
  "read-file-base64",
] as const;

const allowed = new Set<string>(INVOKE_CHANNELS);

contextBridge.exposeInMainWorld("fileflow", {
  platform: process.platform,
  invoke: (channel: string, args?: unknown) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Canal não permitido: ${channel}`));
    return ipcRenderer.invoke(channel, args);
  },
});
