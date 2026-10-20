export interface EngineHelpers {
  tmpPath: (ext: string) => string;
  htmlToPdf?: (html: string) => Promise<Buffer>;
}

export interface ConversionEngine {
  category: string;
  label: string;
  extensions: string[];
  getTargets(ext: string): string[];
  convert(inputPath: string, outputFormat: string, helpers: EngineHelpers): Promise<string>;
}
