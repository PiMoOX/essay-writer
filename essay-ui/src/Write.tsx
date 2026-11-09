import { useState } from "react";
import { motion } from "motion/react";
import {
  Sparkles,
  PenLine,
  Search,
  RefreshCw,
  Check,
  AlertTriangle,
  Settings as SettingsIcon,
  Library as LibraryIcon,
  Paperclip,
} from "lucide-react";
import { api } from "./api";
import { loadSettings, providerLabel } from "./Settings";
import { saveEssay, type Essay } from "./library";
import { Quill, SpeechBubbles } from "./Decor";

export type EssayResult = {
  topic: string;
  draft: string;
  review: string;
  final: string;
  /** Present when this essay is tracked in the library. */
  libraryId?: string;
  /** Saved revisions (starts as [final]); absent for results produced before the library existed. */
  versions?: string[];
  /** Index within `versions` of the version currently shown; absent defaults to the latest. */
  index?: number;
  provider?: string;
  model?: string;
};

const STEPS = [
  { title: "Draft", icon: PenLine },
  { title: "Review", icon: Search },
  { title: "Revise", icon: RefreshCw },
];

export default function WritePage({
  onOpenSettings,
  onOpenLibrary,
  onOpenImport,
  onDone,
}: {
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onOpenImport: () => void;
  onDone: (result: EssayResult) => void;
}) {
  const [topic, setTopic] = useState("");
  const [step, setStep] = useState(-1); // -1 = idle, 0..2 = running, 3 = finished
  const [error, setError] = useState("");
  const [libError, setLibError] = useState("");

  const running = step >= 0 && step < 3;

  async function start() {
    const t = topic.trim();
    if (!t || running) return;
    setError("");
    setLibError("");

    const settings = loadSettings();
    const id = crypto.randomUUID();
    const base = {
      id,
      topic: t,
      createdAt: new Date().toISOString(),
      provider: settings ? providerLabel(settings.provider) : "",
      model: settings?.model ?? "",
    };

    // Persist after every completed step so a closed app can still recover the last one.
    function checkpoint(partial: Pick<Essay, "draft" | "review" | "versions">) {
      const res = saveEssay({ ...base, ...partial, updatedAt: new Date().toISOString() });
      if (!res.ok) setLibError(res.error);
    }

    try {
      setStep(0);
      const draft = await api.draft(t);
      checkpoint({ draft, review: "", versions: [] });

      setStep(1);
      const review = await api.review(draft);
      checkpoint({ draft, review, versions: [] });

      setStep(2);
      const final = await api.revise(draft, review);
      checkpoint({ draft, review, versions: [final] });

      setStep(3);
      setTimeout(
        () =>
          onDone({
            topic: t,
            draft,
            review,
            final,
            libraryId: id,
            versions: [final],
            provider: base.provider,
            model: base.model,
          }),
        600,
      );
    } catch (e) {
      setStep(-1);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-xl rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl shadow-purple-500/30 p-8 text-white"
    >
      {/* Decorative illustrations in the empty space around the card */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden xl:block overflow-visible" aria-hidden>
        <Quill className="absolute -left-44 top-2 h-32 w-32 text-purple-200/20" />
        <SpeechBubbles className="absolute -right-40 bottom-8 h-28 w-28 text-blue-200/20" />
      </div>

      <div className="absolute right-4 top-4 z-20 flex gap-3">
        <button
          onClick={onOpenLibrary}
          className="cursor-pointer rounded-xl bg-white/10 p-2.5 text-white/70 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 active:scale-95"
          title="Library"
        >
          <LibraryIcon size={18} />
        </button>
        <button
          onClick={onOpenImport}
          className="cursor-pointer rounded-xl bg-white/10 p-2.5 text-white/70 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 active:scale-95"
          title="Import your essay"
          aria-label="Import your essay"
        >
          <Paperclip size={18} />
        </button>
        <button
          onClick={onOpenSettings}
          className="cursor-pointer rounded-xl bg-white/10 p-2.5 text-white/70 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 active:scale-95"
          title="Settings"
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      <div className="text-center">
        <h1 className="title-shimmer bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Essay Writer
        </h1>
        <p className="mt-2 text-sm tracking-wide text-white/60">
          Enter a topic and let the agents do the rest
        </p>
      </div>

      <input
        dir="auto"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && start()}
        disabled={running}
        placeholder="e.g. The impact of AI on education"
        className="mt-6 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-400/40 disabled:opacity-50"
      />

      <button
        onClick={start}
        disabled={!topic.trim() || running}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-3 font-semibold transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
      >
        <Sparkles size={18} />
        {running ? "Writing..." : "Start"}
      </button>

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

      {libError && (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{libError}</span>
        </div>
      )}

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
    </motion.div>
  );
}