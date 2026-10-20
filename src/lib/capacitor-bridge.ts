interface CategoryInfo {
  category: string;
  label: string;
}

interface CategoryDef {
  category: string;
  label: string;
  extensions: string[];
  targets: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    category: "image",
    label: "Imagens",
    extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif", "avif", "ico", "svg", "heic", "heif"],
    targets: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "avif", "ico", "heic", "heif"],
  },
  {
    category: "document",
    label: "Documentos",
    extensions: ["pdf", "docx", "doc", "pptx", "txt", "html", "htm", "md", "rtf"],
    targets: ["pdf", "docx", "doc", "pptx", "txt", "html", "md", "rtf"],
  },
  {
    category: "audio",
    label: "Audio",
    extensions: ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma", "opus", "aiff"],
    targets: ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma", "opus", "aiff"],
  },
  {
    category: "video",
    label: "Video",
    extensions: ["mp4", "mkv", "webm", "avi", "mov", "gif", "flv", "wmv", "ts", "m4v"],
    targets: ["mp4", "mkv", "webm", "avi", "mov", "gif", "flv", "wmv", "ts", "m4v"],
  },
  {
    category: "spreadsheet",
    label: "Planilhas",
    extensions: ["xlsx", "csv", "json", "xml", "ods", "tsv"],
    targets: ["xlsx", "csv", "json", "xml", "tsv"],
  },
  {
    category: "archive",
    label: "Compactados",
    extensions: ["zip", "tar", "gz", "tgz", "rar", "7z"],
    targets: ["zip", "tar", "tgz", "rar", "7z"],
  },
  {
    category: "ebook",
    label: "E-books",
    extensions: ["epub", "cbz", "mobi", "azw3", "fb2"],
    targets: ["txt", "html", "pdf"],
  },
];

const EXT_MAP: Record<string, CategoryDef> = {};
for (const cat of CATEGORIES) {
  for (const ext of cat.extensions) {
    EXT_MAP[ext] = cat;
  }
}

function getTargets(ext: string): string[] {
  const cat = EXT_MAP[ext.toLowerCase()];
  if (!cat) return [];
  return cat.targets.filter((t) => t !== ext.toLowerCase()).sort();
}

function getCategory(ext: string): CategoryInfo | null {
  const cat = EXT_MAP[ext.toLowerCase()];
  if (!cat) return null;
  return { category: cat.category, label: cat.label };
}

function getAllFormats(): { category: string; label: string; extensions: string[] }[] {
  return CATEGORIES.map((c) => ({
    category: c.category,
    label: c.label,
    extensions: c.extensions,
  }));
}

async function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) {
        resolve(f.name);
      } else {
        resolve(null);
      }
    };
    input.click();
  });
}

export function createCapacitorBridge(): FileFlowBridge {
  return {
    platform: "android",
    invoke: async (channel: string, args?: unknown): Promise<unknown> => {
      switch (channel) {
        case "get-targets":
          return getTargets(args as string);

        case "get-category":
          return getCategory(args as string);

        case "get-all-formats":
          return getAllFormats();

        case "pick-file":
          return pickFile();

        case "save-file":
          try {
            const { Share } = await import("@capacitor/share");
            const a = args as { defaultName: string; sourcePath: string };
            await Share.share({
              title: a.defaultName,
              text: `Arquivo convertido: ${a.defaultName}`,
              dialogTitle: "Salvar arquivo",
            });
          } catch {
            // fallback: do nothing on web
          }
          return null;

        case "set-theme": {
          try {
            const { StatusBar, Style } = await import("@capacitor/status-bar");
            const theme = args as "dark" | "light";
            await StatusBar.setStyle({
              style: theme === "dark" ? Style.Dark : Style.Light,
            });
            await StatusBar.setBackgroundColor({
              color: theme === "dark" ? "#111113" : "#F3EFE6",
            });
          } catch {
            // not available on web
          }
          return null;
        }

        case "read-file-preview":
          return null;

        case "read-file-base64":
          return null;

        case "convert-file":
          throw new Error("Conversão de arquivos disponível apenas no app desktop");

        case "remove-bg":
          throw new Error("Remoção de fundo disponível apenas no app desktop");

        default:
          throw new Error(`Canal não disponível no mobile: ${channel}`);
      }
    },
  };
}
