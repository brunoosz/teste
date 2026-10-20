import { imageEngine } from "./image";
import { documentEngine } from "./document";
import { audioEngine } from "./audio";
import { videoEngine } from "./video";
import type { ConversionEngine } from "./types";

export const engines: ConversionEngine[] = [imageEngine, documentEngine, audioEngine, videoEngine];

export function findEngine(ext: string): ConversionEngine | undefined {
  return engines.find((e) => e.extensions.includes(ext.toLowerCase()));
}

export function getTargets(ext: string): string[] {
  const engine = findEngine(ext);
  return engine?.getTargets(ext) ?? [];
}

export function getCategory(ext: string): { category: string; label: string } | null {
  const engine = findEngine(ext);
  if (!engine) return null;
  return { category: engine.category, label: engine.label };
}

export function getAllFormats(): { category: string; label: string; extensions: string[] }[] {
  return engines.map((e) => ({ category: e.category, label: e.label, extensions: e.extensions }));
}
