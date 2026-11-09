import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import {
  Copy,
  Check,
  Undo2,
  Redo2,
  Wand2,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { api } from "./api";
import ExportMenu from "./ExportMenu";
import type { EssayResult } from "./Write";
import { getEssay, saveEssay } from "./library";
import { Quill, PaperSheet } from "./Decor";

const TABS = ["Draft", "Review", "Current version"] as const;
type Tab = (typeof TABS)[number];

export default function ResultPage({
  result,
  onNew,
}: {
  result: EssayResult;
  onNew: () => void;
}) {
  // Version history: versions[0] is the original essay produced by the agents, and `index`
  // points at the version currently shown. Undo/redo only move the pointer, so no version
  // is ever discarded by undoing.
  const [versions, setVersions] = useState<string[]>(
    result.versions && result.versions.length > 0 ? result.versions : [],
  );
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(result.index ?? versions.length - 1, Math.max(versions.length - 1, 0))),
  );
  const [request, setRequest] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [libError, setLibError] = useState("");

  const incomplete = versions.length === 0;
  const current = versions[index] ?? "";
  const canUndo = !busy && index > 0;
  const canRedo = !busy && index < versions.length - 1;

  // Only offer tabs that actually have content.
  const tabs = useMemo(
    () =>
      TABS.filter((t) =>
        t === "Draft" ? !!result.draft : t === "Review" ? !!result.review : !incomplete,
      ),
    [result.draft, result.review, incomplete],
  );
  const [tab, setTab] = useState<Tab>(() => (tabs.includes("Current version") ? "Current version" : tabs[0]));
  const activeTab: Tab = tabs.includes(tab) ? tab : tabs[0];

  const shown =
    activeTab === "Draft" ? result.draft : activeTab === "Review" ? result.review : current;

  // Persist a new revision list (and pointer) back to the library record, keeping every
  // other field intact.
  function persist(nextVersions: string[], nextIndex: number) {
    if (!result.libraryId) return;
    const existing = getEssay(result.libraryId);
    if (!existing) return;
    const res = saveEssay({
      ...existing,
      versions: nextVersions,
      index: nextIndex,
      updatedAt: new Date().toISOString(),
    });
    if (!res.ok) setLibError(res.error);
  }

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) walk the history, but never while the user is typing
  // in a field, so the normal text-editing undo in the prompt field is unaffected.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, canRedo]);

  async function apply() {
    const r = request.trim();
    if (!r || busy) return;
    setBusy(true);
    setError("");
    try {
      const refined = await api.refine(current, r);
      // Standard editor behavior: after an undo, drop the undone branch before appending.
      const next = [...versions.slice(0, index + 1), refined];
      setVersions(next);
      setIndex(next.length - 1);
      persist(next, next.length - 1);
      setRequest("");
      setTab("Current version");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    if (!canUndo) return;
    const next = index - 1;
    setIndex(next);
    persist(versions, next);
  }

  function redo() {
    if (!canRedo) return;
    const next = index + 1;
    setIndex(next);
    persist(versions, next);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-3xl rounded-3xl border border-white/20 bg-white/10 p-8 text-white shadow-2xl shadow-purple-500/30 backdrop-blur-xl"
    >
      {/* Decorative illustrations in the empty space around the card */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden xl:block overflow-visible" aria-hidden>
        <PaperSheet className="absolute -right-36 -top-10 h-28 w-28 text-blue-200/15" />
        <Quill className="absolute -left-32 -bottom-8 h-28 w-28 text-purple-200/15" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onNew}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60"
        >
          <ArrowLeft size={16} /> New essay
        </button>
        <div className="flex items-center gap-3">
          <p dir="auto" className="hidden max-w-[12rem] truncate text-sm text-white/60 sm:block">
            {result.topic}
          </p>
          <ExportMenu title={result.topic} text={shown} disabled={!shown.trim()} />
        </div>
      </div>

      {incomplete && (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            This essay was saved before the revision step finished, so only the draft and review are
            available. Start a new essay to write it fully.
          </span>
        </div>
      )}

      <div className="mt-5 flex gap-2 rounded-2xl bg-white/10 p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative flex-1 rounded-xl py-2 text-sm font-medium"
          >
            {activeTab === t && (
              <motion.div
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-500/30"
              />
            )}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            dir="rtl"
            className="h-[38vh] min-h-[14rem] overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-5 text-right leading-8 text-white/90 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-purple-200 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-blue-200 [&_p]:mb-3 [&_strong]:font-bold [&_strong]:text-white [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pr-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pr-6 [&_hr]:my-4 [&_hr]:border-white/20"
          >
            <ReactMarkdown>{shown}</ReactMarkdown>
          </motion.div>
        </AnimatePresence>

        <button
          onClick={copy}
          className="absolute bottom-3 right-5 rounded-lg bg-white/15 p-2 text-white/70 backdrop-blur transition hover:bg-white/25 hover:text-white"
          title="Copy"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      {!incomplete && (
        <p className="mt-2 text-xs text-white/50">
          Version {index + 1} / {versions.length}
          {activeTab !== "Current version" && " · switch to “Current version” to see your edits"}
        </p>
      )}

      {libError && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{libError}</span>
        </div>
      )}

      {incomplete ? (
        <div className="mt-5">
          <button
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-3 font-semibold transition hover:scale-[1.02]"
          >
            <Sparkles size={18} /> Start a new essay
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <label className="mb-1 block text-sm text-white/70">
            Refine with your own instructions
          </label>
          <input
            dir="auto"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            disabled={busy}
            placeholder="Enter your refinement prompt"
            className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-400/40 disabled:opacity-50"
          />

          {error && (
            <div className="mt-3 flex gap-2 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div className="mt-3 flex gap-3">
            <button
              onClick={apply}
              disabled={!request.trim() || busy}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-3 font-semibold transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
              {busy ? "Applying..." : "Apply"}
            </button>
            <button
              onClick={undo}
              disabled={!canUndo}
              className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-40"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={18} /> Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-40"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 size={18} /> Redo
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
