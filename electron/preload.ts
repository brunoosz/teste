import { contextBridge, ipcRenderer } from "electron";

const INVOKE_CHANNELS = [
  "get-targets",
  "convert-file",
  "remove-bg",
  "pick-file",
  "save-file",
  "set-theme",
] as const;

const allowed = new Set<string>(INVOKE_CHANNELS);

contextBridge.exposeInMainWorld("fileflow", {
  platform: process.platform,
  invoke: (channel: string, args?: unknown) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Canal não permitido: ${channel}`));
    return ipcRenderer.invoke(channel, args);
  },
});
