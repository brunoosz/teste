import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightLeft, Eraser, Sun, Moon } from "lucide-react";
import { Converter } from "@/components/Converter";
import { RemoveBg } from "@/components/RemoveBg";

type Tab = "convert" | "rembg";

function useTheme() {
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    try {
      return (localStorage.getItem("fileflow-theme") as "dark" | "light") ?? "dark";
    } catch {
      return "dark";
    }
  });

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("fileflow-theme", next); } catch {}
    window.fileflow?.invoke("set-theme", next);
  };

  return { theme, toggle };
}

export default function App() {
  const [tab, setTab] = useState<Tab>("convert");
  const { theme, toggle } = useTheme();

  return (
    <div className="h-full flex flex-col">
      {/* Title bar drag area */}
      <div className="drag h-[44px] shrink-0" />

      <div className="flex-1 overflow-y-auto px-4 pb-8 no-scrollbar">
        <div className="max-w-[560px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-title text-fg tracking-tight">
                <span className="text-primary">File</span>Flow
              </h1>
              <p className="text-footnote text-muted mt-0.5">
                Converta arquivos e remova fundos
              </p>
            </div>
            <button
              onClick={toggle}
              className="no-drag h-9 w-9 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-line/[0.08] transition-colors"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>

          {/* Tabs */}
          <div className="surface p-1 flex gap-1 mb-6">
            <TabButton
              active={tab === "convert"}
              onClick={() => setTab("convert")}
              icon={ArrowRightLeft}
              label="Converter"
            />
            <TabButton
              active={tab === "rembg"}
              onClick={() => setTab("rembg")}
              icon={Eraser}
              label="Remover Fundo"
            />
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              {tab === "convert" ? <Converter /> : <RemoveBg />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`no-drag flex-1 h-10 flex items-center justify-center gap-2 text-callout font-semibold rounded-control transition-all duration-200 ${
        active
          ? "bg-primary text-white shadow-md"
          : "text-muted hover:text-fg hover:bg-line/[0.06]"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
