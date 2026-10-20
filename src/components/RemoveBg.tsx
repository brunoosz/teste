import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImageIcon,
  X,
  Check,
  Eraser,
  AlertCircle,
  Download,
  RefreshCw,
  ChevronsLeftRight,
} from "lucide-react";
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
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const isElectron = !!window.fileflow;

  const cleanup = useCallback(() => {
    if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
    if (resultUrl?.startsWith("blob:")) URL.revokeObjectURL(resultUrl);
  }, [originalUrl, resultUrl]);

  useEffect(() => cleanup, [cleanup]);

  const loadPreview = useCallback(
    async (f: File, path?: string) => {
      if (isElectron && path) {
        try {
          const result = (await window.fileflow!.invoke("read-file-preview", {
            filePath: path,
          })) as { dataUrl: string };
          setOriginalUrl(result.dataUrl);
        } catch {
          setOriginalUrl(null);
        }
      } else if (f.size > 0) {
        setOriginalUrl(URL.createObjectURL(f));
      }
    },
    [isElectron],
  );

  const handleFile = useCallback(
    (f: File, path?: string) => {
      cleanup();
      setFile(f);
      setFilePath(path ?? null);
      setResultUrl(null);
      setResultPath(null);
      setStatus("idle");
      setSliderPos(50);
      void loadPreview(f, path);
    },
    [cleanup, loadPreview],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("image/")) {
        const path = (f as unknown as { path?: string }).path;
        handleFile(f, path);
      }
    },
    [handleFile],
  );

  const handlePick = useCallback(async () => {
    if (isElectron) {
      const path = (await window.fileflow!.invoke("pick-file", {
        filters: [
          {
            name: "Imagens",
            extensions: ["png", "jpg", "jpeg", "webp", "bmp"],
          },
        ],
      })) as string | null;
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

        setResultPath(result.outputPath);

        try {
          const preview = (await window.fileflow!.invoke("read-file-preview", {
            filePath: result.outputPath,
          })) as { dataUrl: string };
          setResultUrl(preview.dataUrl);
        } catch {
          setResultUrl(null);
        }

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

  const handleSave = useCallback(async () => {
    if (!resultPath) return;
    const name =
      (file?.name ?? "imagem").replace(/\.[^.]+$/, "") + "_sem_fundo.png";
    await window.fileflow!.invoke("save-file", {
      defaultName: name,
      sourcePath: resultPath,
    });
  }, [resultPath, file]);

  const clear = () => {
    cleanup();
    setFile(null);
    setFilePath(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setResultPath(null);
    setStatus("idle");
    setSliderPos(50);
  };

  const updateSlider = useCallback((clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateSlider(e.clientX);
    },
    [updateSlider],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      updateSlider(e.clientX);
    },
    [updateSlider],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const showComparison = status === "success" && originalUrl && resultUrl;

  return (
    <div data-enter="">
      {/* Drop zone — visible only when no file */}
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
          <div className="h-12 w-12 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
            <ImageIcon size={22} className="text-secondary" />
          </div>
          <p className="text-body text-fg font-medium mb-1">
            Arraste uma imagem aqui
          </p>
          <p className="text-footnote text-muted">
            ou{" "}
            <span className="text-primary font-semibold">
              clique para selecionar
            </span>
          </p>
        </div>
      )}

      {/* File loaded — preview + comparison */}
      {file && (
        <div className="surface overflow-hidden">
          {/* Comparison slider or single preview */}
          {showComparison ? (
            <div
              ref={sliderRef}
              className="relative select-none touch-none cursor-ew-resize"
              style={{ aspectRatio: "auto", minHeight: 200, maxHeight: 400 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Before (original) — full width */}
              <div className="absolute inset-0 bg-elevated/30">
                <img
                  src={originalUrl}
                  alt="Original"
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              </div>

              {/* After (result on checkerboard) — clipped by slider */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
              >
                <div className="w-full h-full checkerboard">
                  <img
                    src={resultUrl}
                    alt="Sem fundo"
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                </div>
              </div>

              {/* Slider line + handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.4)] pointer-events-none"
                style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-auto">
                  <ChevronsLeftRight size={18} className="text-neutral-700" />
                </div>
              </div>

              {/* Labels */}
              <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/50 text-[11px] font-semibold text-white pointer-events-none">
                Antes
              </div>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/50 text-[11px] font-semibold text-white pointer-events-none">
                Depois
              </div>
            </div>
          ) : (
            originalUrl && (
              <div className="relative bg-elevated/30 flex items-center justify-center p-4" style={{ minHeight: 200, maxHeight: 400 }}>
                <img
                  src={originalUrl}
                  alt="Preview"
                  className="max-h-[360px] max-w-full object-contain rounded-control"
                />

                {/* Loading overlay */}
                <AnimatePresence>
                  {status === "loading" && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-t-[var(--radius-lg)]"
                    >
                      <div className="h-10 w-10 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
                      <p className="text-sm font-medium text-white/90">
                        Removendo fundo...
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          )}

          {/* File info bar */}
          <div className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-card bg-secondary/10 flex items-center justify-center shrink-0">
              <ImageIcon size={20} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold truncate">{file.name}</p>
              {file.size > 0 && (
                <p className="text-footnote text-muted">
                  {formatSize(file.size)}
                </p>
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

      {/* Action buttons */}
      {file && !showComparison && status !== "loading" && (
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

      {showComparison && (
        <div className="mt-5 flex gap-3">
          <Button block size="lg" icon={Download} onClick={handleSave}>
            Salvar Resultado
          </Button>
          <Button
            variant="outline"
            size="lg"
            icon={RefreshCw}
            onClick={clear}
          >
            Nova
          </Button>
        </div>
      )}

      {/* Status messages */}
      <AnimatePresence>
        {status === "success" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 surface p-4 flex items-center gap-3 border-success/20"
          >
            <div className="h-7 w-7 rounded-full bg-success/15 flex items-center justify-center">
              <Check size={15} className="text-success" />
            </div>
            <p className="text-footnote text-success font-medium">
              {statusMsg}
            </p>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 surface p-4 flex items-center gap-3 border-danger/20"
          >
            <div className="h-7 w-7 rounded-full bg-danger/15 flex items-center justify-center">
              <AlertCircle size={15} className="text-danger" />
            </div>
            <p className="text-footnote text-danger font-medium">{statusMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supported formats — only when no file */}
      {!file && (
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
      )}

      {/* Inline checkerboard style */}
      <style>{`
        .checkerboard {
          background-color: rgb(var(--elevated));
          background-image:
            linear-gradient(45deg, rgb(var(--line) / 0.15) 25%, transparent 25%),
            linear-gradient(-45deg, rgb(var(--line) / 0.15) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgb(var(--line) / 0.15) 75%),
            linear-gradient(-45deg, transparent 75%, rgb(var(--line) / 0.15) 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
        }
      `}</style>
    </div>
  );
}
