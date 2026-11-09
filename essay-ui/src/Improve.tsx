import { useEffect, useRef, useState, type DragEvent } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  FileText,
  Paperclip,
  Loader2,
  AlertTriangle,
  Sparkles,
  Search,
  RefreshCw,
  Check,
} from "lucide-react";
import { api } from "./api";
import ExportMenu from "./ExportMenu";
import { loadSettings, providerLabel } from "./Settings";
import type { EssayResult } from "./Write";

const ACCEPTED = ".txt,.md,.docx,.pdf";
const ACCEPTED_EXTENSIONS = ACCEPTED.split(",");

// Same step progress UI as the main flow, minus the Draft step (the user's essay is the draft).
const STEPS = [
  { title: "Review", icon: Search },
  { title: "Revise", icon: RefreshCw },
];

type Preset = { key: string; label: string; text: string };

const PRESETS: Preset[] = [
  { key: "grammar", label: "Fix grammar", text: "Fix grammar and spelling mistakes" },
  { key: "formal", label: "More formal", text: "Make the tone more formal" },
  { key: "simpler", label: "Simpler", text: "Use simpler words and shorter sentences" },
  {
    key: "shorter",
    label: "Shorter",
    text: "Shorten the essay while keeping all key points",
  },
  {
    key: "arguments",
    label: "Stronger arguments",
    text: "Make the arguments stronger and more convincing",
  },
];

/** Use the first line of the essay as its title, so the result view can show/export it. */
function essayTopic(essay: string): string {
  const first = essay
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first) return "My essay";
  const clean = first.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

export default function ImprovePage({
  onBack,
  onOpenSettings,
  onDone,
}: {
  onBack: () => void;
  onOpenSettings: () => void;
  onDone: (result: EssayResult) => void;
}) {
  const [text, setText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [activeChips, setActiveChips] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState(-1); // -1 = idle, 0..1 = running, 2 = finished
  const fileInput = useRef<HTMLInputElement>(null);

  // Tauri's native drop handling is disabled (dragDropEnabled in tauri.conf.json), so
  // the webview receives HTML5 drag events for the whole window. Guard it: a file
  // dropped anywhere outside the textarea must not make the app navigate to that file.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const running = step >= 0 && step < STEPS.length;

  function toggleChip(p: Preset) {
    if (running) return;
    if (activeChips.has(p.key)) {
      setActiveChips((prev) => {
        const next = new Set(prev);
        next.delete(p.key);
        return next;
      });
      // Remove the preset text again; if the user edited it away already, only deselect.
      setInstruction((cur) => {
        const i = cur.indexOf(p.text);
        if (i === -1) return cur;
        return (cur.slice(0, i) + cur.slice(i + p.text.length))
          .replace(/^[ \t]*,[ \t]*/, "")
          .replace(/[ \t]*,[ \t]*$/, "")
          .trim();
      });
    } else {
      setActiveChips((prev) => new Set(prev).add(p.key));
      setInstruction((cur) => (cur.trim() ? `${cur.trim()}, ${p.text}` : p.text));
    }
  }

  async function improve() {
    const essay = text.trim();
    if (!essay || running) return;
    setError("");

    const settings = loadSettings();
    const prompt = instruction.trim();

    try {
      setStep(0);
      const critique = await api.improveReview(essay, prompt);

      setStep(1);
      const final = await api.improveRevise(essay, prompt, critique);

      setStep(2);
      setTimeout(
        () =>
          onDone({
            topic: essayTopic(essay),
            // The user's original text is the "draft"; the critique and the improved
            // essay fill the result view the same way the main flow does.
            draft: text,
            review: critique,
            final,
            versions: [final],
            provider: settings ? providerLabel(settings.provider) : "",
            model: settings?.model ?? "",
          }),
        600,
      );
    } catch (e) {
      setStep(-1);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function importFile(file: File) {
    const ext = (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(
        `Unsupported file type${ext ? ` ${ext}` : ""}. Supported types: ${ACCEPTED}`,
      );
      return;
    }
    setError("");
    setUploading(true);
    try {
      setText(await api.importFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) importFile(file);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-2xl rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl shadow-purple-500/30 p-8 text-white"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="cursor-pointer rounded-xl bg-white/10 p-2.5 text-white/70 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 active:scale-95"
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 p-3 shadow-lg shadow-purple-500/30">
          <FileText size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Improve my essay</h1>
          <p className="text-sm tracking-wide text-white/60">
            Paste your essay, or import a file
          </p>
        </div>
      </div>

      <textarea
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={uploading || running}
        rows={14}
        spellCheck={false}
        placeholder="Paste or type your essay here, or drag & drop a .txt, .md, .docx or .pdf file..."
        className={`mt-6 w-full resize-y rounded-xl border bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none transition focus:ring-2 focus:ring-purple-400/40 disabled:opacity-50 ${
          dragging
            ? "border-purple-300 ring-2 ring-purple-400/40"
            : "border-white/20 focus:border-purple-300"
        }`}
      />

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/50">
        <span>Drag &amp; drop a file onto the text area to import it</span>
        <span>
          {words} words · {text.length} characters
        </span>
      </div>

      {/* Optional improvement instruction */}
      <div className="mt-4">
        <label className="mb-2 block text-sm text-white/70">
          What should be improved? (optional)
        </label>
        <div className="mb-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const on = activeChips.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => toggleChip(p)}
                disabled={running}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 disabled:opacity-40 ${
                  on
                    ? "border-purple-300/60 bg-purple-500/30 text-white"
                    : "border-white/20 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
                }`}
              >
                {on && <Check size={12} />}
                {p.label}
              </button>
            );
          })}
        </div>
        <textarea
          dir="auto"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={running}
          rows={2}
          spellCheck={false}
          placeholder="e.g. make the tone more formal, shorten it, fix grammar"
          className="w-full resize-y rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-400/40 disabled:opacity-50"
        />
      </div>

      {error && (
        <div className="mt-4 flex gap-2 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="break-words">
            {error}
            <button onClick={onOpenSettings} className="ml-2 underline">
              Open settings
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading || running}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-40"
        >
          {uploading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Paperclip size={18} />
          )}
          {uploading ? "Importing..." : "Import file"}
        </button>
        <ExportMenu text={text} disabled={!text.trim() || running} />
        <button
          onClick={improve}
          disabled={!text.trim() || running}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-3 font-semibold transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
        >
          {running ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Sparkles size={18} />
          )}
          {running ? "Improving..." : "Improve"}
        </button>
      </div>

      {step >= 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <div className="flex items-start">
            {STEPS.map((s, i) => {
              const done = step > i;
              const active = step === i;
              const Icon = s.icon;
              return (
                <div key={s.title} className="flex flex-1 items-start">
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={active ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                      transition={active ? { repeat: Infinity, duration: 1.2 } : {}}
                      className={`rounded-full p-3 ${
                        done
                          ? "bg-emerald-500"
                          : active
                          ? "bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/40"
                          : "bg-white/10"
                      }`}
                    >
                      {done ? <Check size={20} /> : <Icon size={20} />}
                    </motion.div>
                    <span className={`text-xs ${done || active ? "text-white" : "text-white/50"}`}>
                      {s.title}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="mx-2 mt-6 h-0.5 flex-1 overflow-hidden rounded bg-white/15">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-400 to-blue-400"
                        animate={{ width: done ? "100%" : "0%" }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Hidden file picker opened by the Import file button */}
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importFile(file);
          // Reset so picking the same file twice in a row still fires onChange.
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
