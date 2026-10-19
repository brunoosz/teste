/// <reference types="vite/client" />

interface FileFlowBridge {
  platform: string;
  invoke: (channel: string, args?: unknown) => Promise<unknown>;
}

interface Window {
  fileflow?: FileFlowBridge;
}
