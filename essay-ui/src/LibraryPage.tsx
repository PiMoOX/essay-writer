import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Search, Trash2, FileText, Inbox } from "lucide-react";
import { deleteEssay, loadLibrary, type Essay } from "./library";

/** Short single-line preview of a saved essay's latest content. */
function preview(e: Essay): string {
  const latest = e.versions.length ? e.versions[e.versions.length - 1] : e.draft || e.review;
  const flat = latest
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\-\[\]!()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > 120 ? flat.slice(0, 120).trimEnd() + "…" : flat;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export default function LibraryPage({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [deleted, setDeleted] = useState(false);

  // Read once per render pass; a delete bumps `deleted` to force a re-read.
  const all = useMemo(() => loadLibrary(), [deleted]);

  const list = query.trim()
    ? all.filter((e) => e.topic.toLowerCase().includes(query.trim().toLowerCase()))
    : all;

  function remove(id: string, topic: string) {
    if (!window.confirm(`Delete "${topic}" from the library? This cannot be undone.`)) return;
    if (deleteEssay(id)) {
      setDeleted((v) => !v);
    } else {
      window.alert("Delete failed: the essay could not be removed from local storage.");
    }
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
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm tracking-wide text-white/60">
            {all.length} saved essay{all.length === 1 ? "" : "s"} on this device
          </p>
        </div>
      </div>

      <div className="relative mt-6">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by topic"
          className="w-full rounded-xl border border-white/20 bg-white/10 py-3 pl-11 pr-4 text-white placeholder-white/40 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-400/40"
        />
      </div>

      {list.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <Inbox size={48} className="text-white/30" />
          <div>
            <p className="font-medium text-white/80">
              {all.length === 0 ? "No saved essays yet" : "No essays match your search"}
            </p>
            <p className="mt-1 text-sm text-white/50">
              {all.length === 0
                ? "Essays you write are saved here automatically, so nothing is lost if the app closes."
                : "Try a different topic."}
            </p>
          </div>
          <button
            onClick={onBack}
            className="mt-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-2.5 font-semibold transition hover:scale-[1.02]"
          >
            Write an essay
          </button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((e) => {
            const incomplete = e.versions.length === 0;
            return (
              <li
                key={e.id}
                className="rounded-2xl border border-white/15 bg-white/5 p-4 transition hover:border-white/30 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 dir="auto" className="font-semibold break-words">
                        {e.topic}
                      </h2>
                      {incomplete && (
                        <span className="rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-0.5 text-xs font-medium text-amber-100">
                          Incomplete
                        </span>
                      )}
                    </div>
                    {(e.provider || e.model) && (
                      <p className="mt-0.5 text-xs text-white/45">
                        {[e.provider, e.model].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {formatDate(e.updatedAt) && (
                      <p className="mt-0.5 text-xs text-white/45">{formatDate(e.updatedAt)}</p>
                    )}
                    {preview(e) && (
                      <p dir="auto" className="mt-1.5 line-clamp-2 text-sm text-white/60">
                        {preview(e)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => onOpen(e.id)}
                      className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => remove(e.id, e.topic)}
                      className="rounded-xl bg-white/10 p-2 text-white/60 transition hover:bg-red-400/20 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
