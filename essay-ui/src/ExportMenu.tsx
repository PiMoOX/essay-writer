import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Download, FileText, FileType2, Loader2, ChevronDown } from "lucide-react";
import { api } from "./api";

const FORMATS = [
  { id: "docx", label: "Word", ext: ".docx", Icon: FileType2 },
  { id: "pdf", label: "PDF", ext: ".pdf", Icon: FileText },
  { id: "md", label: "Markdown", ext: ".md", Icon: FileText },
  { id: "txt", label: "Text", ext: ".txt", Icon: FileText },
] as const;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Save a blob through Tauri's native dialog, or a browser download as fallback. */
async function saveBlob(blob: Blob, filename: string, ext: string) {
  if (isTauri()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await save({
      defaultPath: filename,
      filters: [{ name: ext.replace(".", "").toUpperCase(), extensions: [ext.replace(".", "")] }],
    });
    if (!path) return; // user cancelled
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }

  // Plain browser context (e.g. vite dev without Tauri): trigger a download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function ExportMenu({
  title,
  text,
  disabled,
}: {
  title?: string;
  text: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Keep the "Saved" note brief, and drop it once the menu is used again.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  async function pick(format: string, ext: string) {
    if (busy || disabled) return;
    setBusy(format);
    setError("");
    setOpen(false);
    try {
      const base = (title || "").trim() || "essay";
      const { blob, filename } = await api.exportFile(title || "", text, format);
      await saveBlob(blob, filename || `${base}${ext}`, ext);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !!busy}
        title="Export"
        className="flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : saved ? (
          <Check size={18} />
        ) : (
          <Download size={18} />
        )}
        <span>{busy ? "Exporting..." : saved ? "Saved" : "Export"}</span>
        <ChevronDown
          size={14}
          className={`transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-white/20 bg-white/10 shadow-2xl shadow-purple-500/30 backdrop-blur-xl"
          >
            {FORMATS.map(({ id, label, ext, Icon }) => (
              <button
                key={id}
                onClick={() => pick(id, ext)}
                disabled={!!busy}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/90 transition hover:bg-white/20 disabled:opacity-40"
              >
                <Icon size={16} className="shrink-0 text-white/70" />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-xs text-white/40">{ext}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="absolute left-0 top-full mt-2 w-max max-w-[16rem] break-words rounded-lg border border-red-300/30 bg-red-400/10 p-2 text-xs text-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
