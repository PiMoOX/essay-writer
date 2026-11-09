import { useState } from "react";
import "./App.css";
import SettingsPage, { loadSettings } from "./Settings";
import WritePage, { type EssayResult } from "./Write";
import ResultPage from "./Result";
import LibraryPage from "./LibraryPage";
import ImprovePage from "./Improve";
import { getEssay } from "./library";
import { Orbs, Books, Lightbulb } from "./Decor";
import essayBackground from "./assets/essay-background.webp";

type Page = "write" | "settings" | "result" | "library" | "improve";

function App() {
  const [page, setPage] = useState<Page>(loadSettings() ? "write" : "settings");
  const [result, setResult] = useState<EssayResult | null>(null);

  // Open a saved essay on the Result page, restoring its position in the version history.
  function openEssay(id: string) {
    const e = getEssay(id);
    if (!e) {
      setPage("library");
      return;
    }
    const versions = e.versions.filter((v) => typeof v === "string" && v.length > 0);
    setResult({
      topic: e.topic,
      draft: e.draft,
      review: e.review,
      final: versions.length ? versions[versions.length - 1] : "",
      libraryId: e.id,
      versions,
      index: e.index,
      provider: e.provider,
      model: e.model,
    });
    setPage("result");
  }

  return (
    <div
      dir="ltr"
      className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-blue-900 p-6 overflow-hidden"
      style={{
        backgroundImage: `url(${essayBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Orbs />

      {/* Decorative corner illustrations, wide windows only */}
      <div className="pointer-events-none absolute inset-0 z-0 hidden lg:block" aria-hidden>
        <Books className="absolute bottom-6 left-8 h-28 w-28 text-purple-300/15" />
        <Lightbulb className="absolute top-8 right-10 h-24 w-24 text-blue-300/15" />
      </div>

      <div className="relative z-10 flex w-full justify-center">
        {page === "settings" && <SettingsPage onSaved={() => setPage("write")} />}
        {page === "library" && (
          <LibraryPage onBack={() => setPage("write")} onOpen={(id) => openEssay(id)} />
        )}
        {page === "write" && (
          <WritePage
            onOpenSettings={() => setPage("settings")}
            onOpenLibrary={() => setPage("library")}
            onOpenImport={() => setPage("improve")}
            onDone={(r) => {
              setResult(r);
              setPage("result");
            }}
          />
        )}
        {page === "improve" && (
          <ImprovePage
            onBack={() => setPage("write")}
            onOpenSettings={() => setPage("settings")}
            onDone={(r) => {
              setResult(r);
              setPage("result");
            }}
          />
        )}
        {page === "result" && result && (
          <ResultPage result={result} onNew={() => setPage("write")} />
        )}
      </div>
    </div>
  );
}

export default App;
