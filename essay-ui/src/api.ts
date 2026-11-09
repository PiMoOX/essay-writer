import { loadSettings } from "./Settings";

const BASE = "http://127.0.0.1:8765";

type Conn = {
  format: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

async function send(path: string, body: object): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the local server. Is it running on port 8765?");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (typeof data?.detail === "string") throw new Error(data.detail);
    throw new Error("Request failed. Check your settings and try again.");
  }
  return data.text as string;
}

async function post(path: string, body: object): Promise<string> {
  const saved = loadSettings();
  if (!saved) throw new Error("Please set up your connection in Settings first.");
  // Settings saved by older versions may not have a format yet
  const settings = { ...saved, format: saved.format ?? "openai" };
  return send(path, { settings, ...body });
}

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/import-file`, { method: "POST", body: form });
  } catch {
    throw new Error("Cannot reach the local server. Is it running on port 8765?");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (typeof data?.detail === "string") throw new Error(data.detail);
    throw new Error("Import failed. Please try a different file.");
  }
  if (typeof data?.text !== "string") {
    throw new Error("Import failed. The server returned an unexpected response.");
  }
  return data.text;
}

export type ExportResult = {
  blob: Blob;
  filename: string;
};

async function exportEssay(title: string, text: string, format: string): Promise<ExportResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text, format }),
    });
  } catch {
    throw new Error("Cannot reach the local server. Is it running on port 8765?");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (typeof data?.detail === "string") throw new Error(data.detail);
    throw new Error("Export failed. Please try again.");
  }

  // Prefer the UTF-8 filename* value so Persian titles survive; fall back to filename=.
  const disposition = res.headers.get("Content-Disposition") || "";
  let filename = "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) {
    try {
      filename = decodeURIComponent(utf8[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      filename = "";
    }
  }
  if (!filename) {
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    if (plain) filename = plain[1].trim();
  }
  return { blob: await res.blob(), filename: filename || "essay" };
}

export const api = {
  draft: (topic: string) => post("/draft", { topic }),
  review: (draft: string) => post("/review", { draft }),
  revise: (draft: string, critique: string) => post("/revise", { draft, critique }),
  refine: (essay: string, request: string) => post("/refine", { essay, request }),
  // Step 1 of the improve flow: critique the user's essay (returns the critique).
  improveReview: (essay: string, instruction: string) =>
    post("/improve", { essay, instruction, phase: "review" }),
  // Step 2: rewrite the essay by applying that critique (returns the improved essay).
  improveRevise: (essay: string, instruction: string, critique: string) =>
    post("/improve", { essay, instruction, phase: "revise", critique }),
  importFile: (file: File) => uploadFile(file),
  exportFile: (title: string, text: string, format: string) =>
    exportEssay(title, text, format),
};

// Tests the values currently typed in the form (not the saved ones)
export function testConnection(settings: Conn): Promise<string> {
  return send("/test", { settings });
}