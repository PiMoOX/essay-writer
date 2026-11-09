import { useState } from "react";
import { motion } from "motion/react";
import {
  Eye,
  EyeOff,
  Save,
  KeyRound,
  ShieldAlert,
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { testConnection } from "./api";
import { SpeechBubbles, Books } from "./Decor";

type Format = "openai" | "anthropic" | "gemini";

const FORMATS: Record<Format, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

// "url" is filled automatically when a service is selected. The model is always left empty.
const PROVIDERS = {
  openai: { label: "OpenAI", format: "openai", url: "https://api.openai.com/v1", needsKey: true },
  anthropic: { label: "Claude", format: "anthropic", url: "https://api.anthropic.com", needsKey: true },
  gemini: { label: "Gemini", format: "gemini", url: "https://generativelanguage.googleapis.com", needsKey: true },
  openrouter: { label: "OpenRouter", format: "openai", url: "https://openrouter.ai/api/v1", needsKey: true },
  zai: { label: "Z.ai", format: "openai", url: "https://api.z.ai/api/paas/v4", needsKey: true },
  gapgpt: { label: "GapGPT", format: "openai", url: "https://api.gapgpt.app/v1", needsKey: true },
  ollama: { label: "Ollama", format: "openai", url: "http://localhost:11434/v1", needsKey: false },
  custom: { label: "Custom", format: "openai", url: "", needsKey: false },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

export type AppSettings = {
  provider: ProviderKey;
  format: Format;
  apiKey: string;
  baseUrl: string;
  model: string;
};

// Human-readable label for a saved provider key (e.g. for display in the library).
// Never returns the key's address or settings, only the display name.
export function providerLabel(key: string): string {
  const p = (PROVIDERS as Record<string, { label: string }>)[key];
  return p?.label ?? key;
}

export function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem("essay-settings");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const inputClass =
  "w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-400/40 transition";

export default function SettingsPage({ onSaved }: { onSaved: () => void }) {
  const saved = loadSettings();
  const startProvider: ProviderKey = saved?.provider ?? "openai";

  const [provider, setProvider] = useState<ProviderKey>(startProvider);
  const [format, setFormat] = useState<Format>(saved?.format ?? PROVIDERS[startProvider].format);
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl || PROVIDERS[startProvider].url);
  const [model, setModel] = useState(saved?.model ?? "");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function pick(p: ProviderKey) {
    if (p === provider) return;
    setProvider(p);
    setFormat(PROVIDERS[p].format);
    setBaseUrl(PROVIDERS[p].url);
    // The key and model are cleared on purpose: a key must never be sent to another service's address
    setApiKey("");
    setModel("");
    setTestResult(null);
  }

  function save() {
    localStorage.setItem(
      "essay-settings",
      JSON.stringify({
        provider,
        format,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      })
    );
    setDone(true);
    setTimeout(onSaved, 700);
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await testConnection({
        format,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      });
      setTestResult({ ok: true, msg: "Connection works." });
    } catch (e) {
      setTestResult({
        ok: false,
        msg: e instanceof Error ? e.message : "Connection failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  const needsKey = PROVIDERS[provider].needsKey;
  const canSave = baseUrl.trim() && model.trim() && (apiKey.trim() || !needsKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-xl rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl shadow-purple-500/30 p-8 text-white"
    >
      {/* Decorative illustrations in the empty space around the card */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden xl:block overflow-visible" aria-hidden>
        <SpeechBubbles className="absolute -left-40 top-4 h-28 w-28 text-purple-200/15" />
        <Books className="absolute -right-36 bottom-6 h-28 w-28 text-blue-200/15" />
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 p-3 shadow-lg shadow-purple-500/30">
          <KeyRound size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connection settings</h1>
          <p className="text-sm tracking-wide text-white/60">Your key is stored only on this device</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 ${
              provider === p
                ? "bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-500/30"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {PROVIDERS[p].label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {provider === "custom" && (
          <div>
            <label className="mb-1 block text-sm text-white/70">Service type</label>
            <div className="flex gap-2">
              {(Object.keys(FORMATS) as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 rounded-xl py-2 text-sm transition ${
                    format === f
                      ? "bg-white/25 border border-purple-300"
                      : "bg-white/10 border border-transparent hover:bg-white/20"
                  }`}
                >
                  {FORMATS[f]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-white/70">
            API key {!needsKey && "(optional for local services)"}
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={inputClass + " pr-12"}
            />
            <button
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              type="button"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-white/70">Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-white/70">Model name</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model name"
            className={inputClass}
          />
        </div>
      </div>

      {provider === "custom" && (
        <div className="mt-4 flex gap-2 rounded-xl bg-amber-400/10 border border-amber-300/30 p-3 text-xs text-amber-100">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>Your key is sent to the address you enter. Only use services you trust.</span>
        </div>
      )}

      {testResult && (
        <div
          className={`mt-5 flex gap-2 rounded-xl border p-3 text-sm ${
            testResult.ok
              ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
              : "border-red-300/30 bg-red-400/10 text-red-100"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <span className="break-words">{testResult.msg}</span>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={runTest}
          disabled={!canSave || testing}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-40"
        >
          {testing ? <Loader2 size={18} className="animate-spin" /> : <Plug size={18} />}
          {testing ? "Testing..." : "Test connection"}
        </button>
        <button
          onClick={save}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-3 font-semibold transition hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
        >
          <Save size={18} />
          {done ? "Saved ✓" : "Save"}
        </button>
      </div>
    </motion.div>
  );
}