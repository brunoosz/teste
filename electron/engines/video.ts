import type { ConversionEngine, EngineHelpers } from "./types";

const EXTENSIONS = ["mp4", "mkv", "webm", "avi", "mov", "gif", "flv", "wmv", "ts", "m4v"];

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

  if (out === "mp4") {
    args.push("-codec:v", "libx264", "-preset", "medium", "-crf", "23", "-codec:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
  } else if (out === "mkv") {
    args.push("-codec:v", "libx264", "-preset", "medium", "-crf", "23", "-codec:a", "aac", "-b:a", "192k");
  } else if (out === "webm") {
    args.push("-codec:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-codec:a", "libvorbis", "-q:a", "5");
  } else if (out === "avi") {
    args.push("-codec:v", "mpeg4", "-q:v", "5", "-codec:a", "mp3", "-b:a", "192k");
  } else if (out === "mov") {
    args.push("-codec:v", "libx264", "-preset", "medium", "-crf", "23", "-codec:a", "aac", "-b:a", "192k");
  } else if (out === "flv") {
    args.push("-codec:v", "flv1", "-q:v", "5", "-codec:a", "mp3", "-b:a", "128k");
  } else if (out === "wmv") {
    args.push("-codec:v", "wmv2", "-b:v", "2M", "-codec:a", "wmav2", "-b:a", "192k");
  } else if (out === "ts") {
    args.push("-codec:v", "libx264", "-preset", "medium", "-crf", "23", "-codec:a", "aac", "-b:a", "192k", "-f", "mpegts");
  } else if (out === "m4v") {
    args.push("-codec:v", "libx264", "-preset", "medium", "-crf", "23", "-codec:a", "aac", "-b:a", "192k");
  } else if (out === "gif") {
    const filterArgs = [
      "-i", inputPath, "-y",
      "-vf", "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
      "-loop", "0",
      outPath,
    ];
    await exec(ffmpeg, filterArgs, { timeout: 300_000 });
    return outPath;
  }

  args.push(outPath);

  await exec(ffmpeg, args, { timeout: 300_000 });
  return outPath;
}

export const videoEngine: ConversionEngine = {
  category: "video",
  label: "Vídeo",
  extensions: EXTENSIONS,
  getTargets: (ext: string) => TARGETS[ext.toLowerCase()] ?? [],
  convert,
};
