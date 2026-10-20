import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileIcon,
  X,
  Check,
  Download,
  AlertCircle,
  Image,
  FileText,
  Music,
  Film,
  Table2,
  Archive,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "loading" | "success" | "error";

interface CategoryInfo {
  category: string;
  label: string;
}

const CATEGORIES: { category: string; label: string; icon: typeof Image; extensions: string[]; color: string }[] = [
  {
    category: "image",
    label: "Imagens",
    icon: Image,
    extensions: ["PNG", "JPG", "JPEG", "WEBP", "BMP", "GIF", "TIFF", "AVIF", "ICO", "SVG"],
    color: "primary",
  },
  {
    category: "document",
    label: "Documentos",
    icon: FileText,
    extensions: ["PDF", "DOCX", "TXT", "HTML", "MD"],
    color: "secondary",
  },
  {
    category: "audio",
    label: "Áudio",
    icon: Music,
    extensions: ["MP3", "WAV", "OGG", "AAC", "FLAC", "M4A", "WMA", "OPUS"],
    color: "success",
  },
  {
    category: "video",
    label: "Vídeo",
    icon: Film,
    extensions: ["MP4", "MKV", "WEBM", "AVI", "MOV", "GIF"],
    color: "warning",
  },
  {
    category: "spreadsheet",
    label: "Planilhas",
    icon: Table2,
    extensions: ["XLSX", "CSV", "JSON", "XML", "ODS", "TSV"],
    color: "info",
  },
  {
    category: "archive",
    label: "Compactados",
    icon: Archive,
    extensions: ["ZIP", "TAR", "GZ", "TGZ"],
    color: "accent",
  },
  {
    category: "ebook",
    label: "E-books",
    icon: BookOpen,
    extensions: ["EPUB", "CBZ"],
    color: "ebook",
  },
];

const EXT_TO_CATEGORY: Record<string, CategoryInfo> = {};
for (const cat of CATEGORIES) {
  for (const ext of cat.extensions) {
    EXT_TO_CATEGORY[ext.toLowerCase()] = { category: cat.category, label: cat.label };
  }
}

const FALLBACK_TARGETS: Record<string, string[]> = {
  image: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "avif", "ico"],
  document: ["pdf", "docx", "txt", "html", "md"],
  audio: ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma", "opus"],
  video: ["mp4", "mkv", "webm", "avi", "mov", "gif"],
  spreadsheet: ["xlsx", "csv", "json", "xml", "tsv"],
  archive: ["zip", "tar", "tgz"],
  ebook: ["txt", "html", "pdf"],
};

function fallbackTargets(ext: string): string[] {
  const cat = EXT_TO_CATEGORY[ext];
  if (!cat) return [];
  return (FALLBACK_TARGETS[cat.category] ?? []).filter((t) => t !== ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function getExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

const BADGE_STYLES: Record<string, string> = {
  image: "bg-primary/10 text-primary",
  document: "bg-secondary/10 text-secondary",
  audio: "bg-success/10 text-success",
  video: "bg-warning/10 text-warning",
  spreadsheet: "bg-emerald-500/10 text-emerald-500",
  archive: "bg-amber-500/10 text-amber-500",
  ebook: "bg-violet-500/10 text-violet-500",
};

export function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileCategory, setFileCategory] = useState<CategoryInfo | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const isElectron = !!window.fileflow;

  const handleFile = useCallback(
    async (f: File, path?: string) => {
      setFile(f);
      setFilePath(path ?? null);
      setSelectedTarget(null);
      setStatus("idle");

      const ext = getExtension(f.name);

      if (isElectron) {
        const [tgts, cat] = await Promise.all([
          window.fileflow!.invoke("get-targets", ext) as Promise<string[]>,
          window.fileflow!.invoke("get-category", ext) as Promise<CategoryInfo | null>,
        ]);
        setTargets(tgts);
        setFileCategory(cat);
      } else {
        setTargets(fallbackTargets(ext));
        setFileCategory(EXT_TO_CATEGORY[ext] ?? null);
      }
    },
    [isElectron],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) {
        const path = (f as unknown as { path?: string }).path;
        void handleFile(f, path);
      }
    },
    [handleFile],
  );

  const handlePick = useCallback(async () => {
    if (isElectron) {
      const path = (await window.fileflow!.invoke("pick-file")) as string | null;
      if (!path) return;
      const name = path.split(/[\\/]/).pop() ?? "file";
      const fakeFile = new File([], name);
      void handleFile(fakeFile, path);
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) void handleFile(f);
      };
      input.click();
    }
  }, [handleFile, isElectron]);

  const handleConvert = useCallback(async () => {
    if (!selectedTarget || (!filePath && !file)) return;
    setStatus("loading");
    setStatusMsg("Convertendo...");

    try {
      if (isElectron && filePath) {
        const result = (await window.fileflow!.invoke("convert-file", {
          inputPath: filePath,
          outputFormat: selectedTarget,
        })) as { outputPath: string };

        const name =
          (file?.name ?? "arquivo").replace(/\.[^.]+$/, "") + "." + selectedTarget;
        await window.fileflow!.invoke("save-file", {
          defaultName: name,
          sourcePath: result.outputPath,
        });

        setStatus("success");
        setStatusMsg("Convertido com sucesso!");
      } else {
        setStatus("error");
        setStatusMsg("Conversão disponível apenas no app desktop");
      }
    } catch (err) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : "Erro na conversão");
    }
  }, [selectedTarget, filePath, file, isElectron]);

  const clear = () => {
    setFile(null);
    setFilePath(null);
    setFileCategory(null);
    setTargets([]);
    setSelectedTarget(null);
    setStatus("idle");
  };

  return (
    <div data-enter="">
      {/* Drop zone */}
      {!file && (
        <div
          className={`surface p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
            dragOver ? "border-primary/60 bg-primary/[0.04]" : ""
          }`}
          onClick={handlePick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Upload size={22} className="text-primary" />
          </div>
          <p className="text-body text-fg font-medium mb-1">Arraste um arquivo aqui</p>
          <p className="text-footnote text-muted">
            ou{" "}
            <span className="text-primary font-semibold">clique para selecionar</span>
          </p>
        </div>
      )}

      {/* File info */}
      {file && (
        <div className="surface p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-card bg-primary/10 flex items-center justify-center shrink-0">
            <FileIcon size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-body font-semibold truncate">{file.name}</p>
              {fileCategory && (
                <span
                  className={`shrink-0 h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center ${
                    BADGE_STYLES[fileCategory.category] ?? "bg-elevated text-muted"
                  }`}
                >
                  {fileCategory.label.replace(/s$/, "")}
                </span>
              )}
            </div>
            {file.size > 0 && (
              <p className="text-footnote text-muted">{formatSize(file.size)}</p>
            )}
          </div>
          <button
            onClick={clear}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Target formats */}
      {file && targets.length > 0 && (
        <div className="mt-4">
          <p className="text-caption text-muted mb-3 px-1">CONVERTER PARA</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((t) => (
              <motion.button
                key={t}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedTarget(t)}
                className={`no-drag h-9 px-4 rounded-full text-footnote font-bold uppercase tracking-wide transition-all duration-150 ${
                  selectedTarget === t
                    ? "bg-primary text-white shadow-md"
                    : "surface text-fg hover:bg-line/[0.06]"
                }`}
              >
                {t}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {file && targets.length === 0 && (
        <div className="mt-4 surface p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-warning shrink-0" />
          <p className="text-footnote text-muted">
            Formato não suportado para conversão
          </p>
        </div>
      )}

      {/* Convert button */}
      {selectedTarget && (
        <div className="mt-5">
          <Button
            block
            size="lg"
            icon={Download}
            loading={status === "loading"}
            onClick={handleConvert}
          >
            Converter para {selectedTarget.toUpperCase()}
          </Button>
        </div>
      )}

      {/* Status */}
      {status === "success" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 surface p-4 flex items-center gap-3 border-success/20"
        >
          <div className="h-7 w-7 rounded-full bg-success/15 flex items-center justify-center">
            <Check size={15} className="text-success" />
          </div>
          <p className="text-footnote text-success font-medium">{statusMsg}</p>
        </motion.div>
      )}

      {status === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 surface p-4 flex items-center gap-3 border-danger/20"
        >
          <div className="h-7 w-7 rounded-full bg-danger/15 flex items-center justify-center">
            <AlertCircle size={15} className="text-danger" />
          </div>
          <p className="text-footnote text-danger font-medium">{statusMsg}</p>
        </motion.div>
      )}

      {/* Supported formats — grouped by category */}
      {!file && (
        <div className="mt-6 space-y-4">
          <p className="text-caption text-muted px-1">FORMATOS SUPORTADOS</p>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.category} className="surface p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center ${BADGE_STYLES[cat.category]?.split(" ")[0] ?? "bg-elevated"}`}
                  >
                    <Icon size={14} className={BADGE_STYLES[cat.category]?.split(" ")[1] ?? "text-muted"} />
                  </div>
                  <p className="text-callout font-semibold text-fg">{cat.label}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.extensions.map((ext) => (
                    <span
                      key={ext}
                      className="h-6 px-2.5 bg-elevated/60 rounded-chip text-caption text-muted flex items-center"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
