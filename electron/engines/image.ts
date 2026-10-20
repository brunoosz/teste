import type { ConversionEngine, EngineHelpers } from "./types";

const IMAGE_EXTS = [
  "png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif", "ico", "avif",
];

const SVG_TARGETS = ["png", "jpg", "webp"];

const ALL_EXTS = [...IMAGE_EXTS, "svg"];

function targetsFor(ext: string): string[] {
  if (ext === "svg") return SVG_TARGETS;
  return IMAGE_EXTS.filter((e) => e !== ext).sort();
}

async function convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string> {
  const sharp = (await import("sharp")).default;
  const out = outputFormat.toLowerCase();
  const outPath = helpers.tmpPath(out === "jpg" ? "jpg" : out);

  let pipeline = sharp(inputPath);

  if (out === "jpg" || out === "jpeg") {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 92 });
  } else if (out === "png") {
    pipeline = pipeline.png();
  } else if (out === "webp") {
    pipeline = pipeline.webp({ quality: 90 });
  } else if (out === "gif") {
    pipeline = pipeline.gif();
  } else if (out === "tiff" || out === "tif") {
    pipeline = pipeline.tiff();
  } else if (out === "avif") {
    pipeline = pipeline.avif({ quality: 80 });
  } else if (out === "bmp") {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const bmpPath = helpers.tmpPath("bmp");
    const sharp2 = (await import("sharp")).default;
    await sharp2(data, {
      raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
    })
      .toFormat("png")
      .toFile(bmpPath);
    return bmpPath;
  } else if (out === "ico") {
    pipeline = pipeline
      .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png();
    const icoPath = helpers.tmpPath("png");
    await pipeline.toFile(icoPath);
    return icoPath;
  } else {
    throw new Error(`Formato de imagem não suportado: ${out}`);
  }

  await pipeline.toFile(outPath);
  return outPath;
}

export const imageEngine: ConversionEngine = {
  category: "image",
  label: "Imagens",
  extensions: ALL_EXTS,
  getTargets: targetsFor,
  convert,
};
