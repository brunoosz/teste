import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma", "opus"];

const TARGETS: Record<string, string[]> = {};
for (const ext of EXTENSIONS) {
  TARGETS[ext] = EXTENSIONS.filter((e) => e !== ext).sort();
}

function getFFmpegPath(): string {
  try {
    const ffmpegStatic = require("ffmpeg-static") as string;
    if (ffmpegStatic.includes("app.asar")) {
      return ffmpegStatic.replace("app.asar", "app.asar.unpacked");
    }
    return ffmpegStatic;
  } catch {
    return "ffmpeg";
  }
}

async function convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  const out = outputFormat.toLowerCase();
  const outPath = helpers.tmpPath(out);
  const ffmpeg = getFFmpegPath();

  const args = ["-i", inputPath, "-y"];

  if (out === "mp3") {
    args.push("-codec:a", "libmp3lame", "-q:a", "2");
  } else if (out === "aac" || out === "m4a") {
    args.push("-codec:a", "aac", "-b:a", "192k");
  } else if (out === "ogg" || out === "opus") {
    args.push("-codec:a", "libvorbis", "-q:a", "6");
  } else if (out === "flac") {
    args.push("-codec:a", "flac");
  } else if (out === "wav") {
    args.push("-codec:a", "pcm_s16le");
  } else if (out === "wma") {
    args.push("-codec:a", "wmav2", "-b:a", "192k");
  }

  args.push(outPath);

  await exec(ffmpeg, args, { timeout: 300_000 });
  return outPath;
}

export const audioEngine: ConversionEngine = {
  category: "audio",
  label: "Áudio",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
