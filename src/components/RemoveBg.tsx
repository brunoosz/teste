import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ImageIcon, X, Check, Eraser, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Status = "idle" | "loading" | "success" | "error";

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export function RemoveBg() {
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const isElectron = !!window.fileflow;

  const handleFile = useCallback((f: File, path?: string) => {
    setFile(f);
    setFilePath(path ?? null);
    setStatus("idle");

    if (f.size > 0) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) {
        const path = (f as unknown as { path?: string }).path;
        handleFile(f, path);
      }
    },
    [handleFile]
  );

  const handlePick = useCallback(async () => {
    if (isElectron) {
      const path = await window.fileflow!.invoke("pick-file", {
        filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
      }) as string | null;
      if (!path) return;
      const name = path.split(/[\\/]/).pop() ?? "image";
      const fakeFile = new File([], name);
      handleFile(fakeFile, path);
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) handleFile(f);
      };
      input.click();
    }
  }, [handleFile, isElectron]);

  const handleRemove = useCallback(async () => {
    if (!filePath && !file) return;
    setStatus("loading");
    setStatusMsg("Removendo fundo... pode levar alguns segundos");

    try {
      if (isElectron && filePath) {
        const result = (await window.fileflow!.invoke("remove-bg", {
          inputPath: filePath,
        })) as { outputPath: string };

        const name = (file?.name ?? "imagem").replace(/\.[^.]+$/, "") + "_sem_fundo.png";
        await window.fileflow!.invoke("save-file", {
          defaultName: name,
          sourcePath: result.outputPath,
        });

        setStatus("success");
        setStatusMsg("Fundo removido com sucesso!");
      } else {
        setStatus("error");
        setStatusMsg("Remoção de fundo disponível apenas no app desktop");
      }
    } catch (err) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : "Erro ao remover fundo");
    }
  }, [filePath, file, isElectron]);

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setFilePath(null);
    setPreview(null);
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
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="h-12 w-12 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
            <ImageIcon size={22} className="text-secondary" />
          </div>
          <p className="text-body text-fg font-medium mb-1">
            Arraste uma imagem aqui
          </p>
          <p className="text-footnote text-muted">
            ou <span className="text-primary font-semibold">clique para selecionar</span>
          </p>
        </div>
      )}

      {/* File info + preview */}
      {file && (
        <div className="surface overflow-hidden">
          {preview && (
            <div className="h-48 bg-elevated/30 flex items-center justify-center p-4">
              <img
                src={preview}
                alt="Preview"
                className="max-h-full max-w-full object-contain rounded-control"
              />
            </div>
          )}
          <div className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-card bg-secondary/10 flex items-center justify-center shrink-0">
              <ImageIcon size={20} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold truncate">{file.name}</p>
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
        </div>
      )}

      {/* Remove button */}
      {file && (
        <div className="mt-5">
          <Button
            block
            size="lg"
            icon={Eraser}
            loading={status === "loading"}
            onClick={handleRemove}
          >
            Remover Fundo
          </Button>
        </div>
      )}

      {/* Status */}
      {status === "loading" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 surface p-4 flex items-center gap-3"
        >
          <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-footnote text-primary font-medium">{statusMsg}</p>
        </motion.div>
      )}

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

      {/* Supported formats */}
      <div className="mt-8 px-1">
        <p className="text-caption text-muted mb-3">FORMATOS ACEITOS</p>
        <div className="flex flex-wrap gap-1.5">
          {["PNG", "JPG", "JPEG", "WEBP", "BMP"].map((f) => (
            <span
              key={f}
              className="h-6 px-2.5 bg-elevated/60 rounded-chip text-caption text-muted flex items-center"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
