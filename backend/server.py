import io
import os
import socket
import sys
import tempfile
from pathlib import Path
from typing import TextIO

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from docx import Document
from pypdf import PdfReader

from export import ExportIn, export_response

app = FastAPI()

# Only the app itself may call this server from a browser context
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",   # tauri dev
        "http://tauri.localhost",  # tauri production (Windows)
        "tauri://localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    # The export endpoint reports the filename here; the UI needs to read it.
    expose_headers=["Content-Disposition"],
)

SYSTEM = (
    "You are a professional Persian writer and editor. Write only in Persian (Farsi script). "
    "Do not insert words or characters from other languages or scripts; "
    "a technical term may appear once in parentheses."
)

# The improve flow edits a user's own essay, which may be in any language.
IMPROVE_SYSTEM = (
    "You are a professional editor. You improve essays while strictly preserving the "
    "author's meaning, facts, and voice. Always write your output in the same language "
    "as the input essay. Never invent facts, citations, or sources."
)


class Settings(BaseModel):
    format: str  # "openai" | "anthropic" | "gemini"
    apiKey: str = ""
    baseUrl: str
    model: str


class TestIn(BaseModel):
    settings: Settings


class DraftIn(BaseModel):
    settings: Settings
    topic: str


class ReviewIn(BaseModel):
    settings: Settings
    draft: str


class ReviseIn(BaseModel):
    settings: Settings
    draft: str
    critique: str


class RefineIn(BaseModel):
    settings: Settings
    essay: str
    request: str


class ImproveIn(BaseModel):
    settings: Settings
    essay: str
    instruction: str = ""
    # The UI drives the pipeline in two steps so it can show progress; a caller that
    # omits these gets the whole Review -> Revise pipeline in one request.
    phase: str = "all"  # "review" | "revise" | "all"
    critique: str = ""


def call_llm(s: Settings, user: str, temperature: float = 0.7, system: str = SYSTEM) -> str:
    base = s.baseUrl.rstrip("/")
    key = s.apiKey.strip()
    try:
        if s.format == "anthropic":
            r = httpx.post(
                f"{base}/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                json={
                    "model": s.model,
                    "max_tokens": 4096,
                    "system": system,
                    "temperature": temperature,
                    "messages": [{"role": "user", "content": user}],
                },
                timeout=300,
            )
            r.raise_for_status()
            blocks = r.json()["content"]
            return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")

        if s.format == "gemini":
            r = httpx.post(
                f"{base}/v1beta/models/{s.model}:generateContent",
                headers={"x-goog-api-key": key},
                json={
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": user}]}],
                    "generationConfig": {"temperature": temperature},
                },
                timeout=300,
            )
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts)

        # Default: OpenAI-compatible
        headers = {"Authorization": f"Bearer {key}"} if key else {}
        r = httpx.post(
            f"{base}/chat/completions",
            headers=headers,
            json={
                "model": s.model,
                "temperature": temperature,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=300,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Provider returned {e.response.status_code}: {e.response.text[:300]}")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Connection failed: {type(e).__name__}")
    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(502, "Unexpected response format from the provider")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/test")
def test(body: TestIn):
    text = call_llm(body.settings, "Reply with the single word: OK", 0)
    return {"text": text}


@app.post("/draft")
def draft(body: DraftIn):
    prompt = (
        "Write a well-structured draft essay in Persian with an introduction, body and "
        f"conclusion on this topic:\n{body.topic}"
    )
    return {"text": call_llm(body.settings, prompt, 0.7)}


@app.post("/review")
def review(body: ReviewIn):
    prompt = (
        "Critically review the draft essay below. List problems in structure, clarity, "
        "argument strength and style as a short list, and list any non-Persian words or "
        "characters. Do not rewrite the essay. Answer in Persian only.\n\n"
        f"Draft:\n{body.draft}"
    )
    return {"text": call_llm(body.settings, prompt, 0.3)}


@app.post("/revise")
def revise(body: ReviseIn):
    prompt = (
        "Revise the essay below by addressing only the critique. Keep what works. "
        "Output only the full final essay in Persian.\n\n"
        f"Essay:\n{body.draft}\n\nCritique:\n{body.critique}"
    )
    return {"text": call_llm(body.settings, prompt, 0.7)}


@app.post("/refine")
def refine(body: RefineIn):
    prompt = (
        "Revise the essay below according to the user's request. Apply only the requested "
        "changes and keep the rest. Output only the full essay in Persian.\n\n"
        f"Essay:\n{body.essay}\n\nUser request:\n{body.request}"
    )
    return {"text": call_llm(body.settings, prompt, 0.7)}


# --- Improve an existing essay (Review -> Revise, no Draft step) ---

MAX_IMPROVE_CHARS = 100_000
# Comfortably below typical model context windows even for token-heavy scripts like
# Persian, and for both the review and the revise call that each carry the chunk.
IMPROVE_CHUNK_CHARS = 6_000


def _split_long_block(block: str, limit: int) -> list[str]:
    """Break one block without paragraph breaks into line/sentence-boundary pieces."""
    if len(block) <= limit:
        return [block]
    for sep in ("\n", ". ", "؟ ", "? ", "! "):
        pieces = [p for p in block.split(sep) if p.strip()]
        if len(pieces) > 1 and all(len(p) <= limit for p in pieces):
            out: list[str] = []
            cur = ""
            for p in pieces:
                candidate = f"{cur}{sep}{p}" if cur else p
                if cur and len(candidate) > limit:
                    out.append(cur)
                    cur = p
                else:
                    cur = candidate
            if cur:
                out.append(cur)
            return out
    return [block[i : i + limit] for i in range(0, len(block), limit)]


def _improve_chunks(text: str, limit: int) -> list[str]:
    """Split an essay into paragraph-bounded chunks that fit the model context."""
    chunks: list[str] = []
    cur = ""
    for raw in text.split("\n\n"):
        para = raw.strip()
        if not para:
            continue
        if len(para) > limit:
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.extend(_split_long_block(para, limit))
            continue
        if cur and len(cur) + len(para) + 2 > limit:
            chunks.append(cur)
            cur = para
        else:
            cur = f"{cur}\n\n{para}" if cur else para
    if cur:
        chunks.append(cur)
    return chunks or [text]


def _improve_review_prompt(essay: str, instruction: str, part: int = 1, of: int = 1) -> str:
    if instruction:
        guidance = (
            f'The user has asked for this specific improvement: "{instruction}". '
            "Focus your critique mainly on that goal, and also flag any other significant "
            "problems with clarity, structure, grammar, flow, or argument strength."
        )
    else:
        guidance = (
            "Review the essay for overall quality: clarity, structure, grammar, flow, "
            "and argument strength."
        )
    context = (
        f"This is part {part} of {of} of a longer essay. Only review this part and do not "
        "suggest adding new sections or content.\n"
        if of > 1
        else ""
    )
    return (
        f"{guidance}\n"
        f"{context}"
        "List the concrete problems you find as a short, actionable list. Do not rewrite "
        "the essay. Write your critique in the same language as the essay.\n\n"
        f"Essay:\n{essay}"
    )


def _improve_revise_prompt(
    essay: str, critique: str, instruction: str, part: int = 1, of: int = 1
) -> str:
    goal = (
        f'The user has asked for this specific improvement: "{instruction}". Apply it '
        "throughout, in addition to fixing the critique.\n"
        if instruction
        else ""
    )
    context = (
        f"This is part {part} of {of} of a longer essay. Revise only this part; keep its "
        "headings and paragraph order, and do not add new sections or content.\n"
        if of > 1
        else ""
    )
    return (
        "Revise the essay below by addressing the critique.\n"
        f"{goal}{context}"
        "Preserve the author's meaning, facts, and voice; do not invent facts, citations "
        "or sources. Keep the original paragraph structure and any Markdown headings. "
        "Write in the same language as the original essay. "
        "Output only the full revised essay, with no commentary.\n\n"
        f"Essay:\n{essay}\n\nCritique:\n{critique}"
    )


@app.post("/improve")
def improve(body: ImproveIn):
    """Improve an essay the user already wrote: Review -> Revise (no Draft step).

    Called with just {"essay", "instruction?"} the whole pipeline runs in one request.
    With phase="review" only the critique is produced (step 1 of the UI progress),
    and phase="revise" + critique applies it (step 2).
    """
    essay = body.essay.strip()
    if not essay:
        raise HTTPException(
            400, "The essay is empty. Paste your essay (or import a file) first."
        )
    if len(essay) > MAX_IMPROVE_CHARS:
        raise HTTPException(
            400,
            f"This essay is {len(essay):,} characters long; the maximum is "
            f"{MAX_IMPROVE_CHARS:,}. Please shorten it and try again.",
        )

    instruction = body.instruction.strip()
    phase = body.phase if body.phase in ("review", "revise") else "all"
    if phase == "revise" and not body.critique.strip():
        raise HTTPException(400, "The critique is missing; run the review step first.")

    chunks = _improve_chunks(essay, IMPROVE_CHUNK_CHARS)
    of = len(chunks)

    def review_all() -> list[str]:
        return [
            call_llm(
                body.settings,
                _improve_review_prompt(c, instruction, i + 1, of),
                0.3,
                IMPROVE_SYSTEM,
            ).strip()
            for i, c in enumerate(chunks)
        ]

    def revise_all(critique: str) -> list[str]:
        return [
            call_llm(
                body.settings,
                _improve_revise_prompt(c, critique, instruction, i + 1, of),
                0.7,
                IMPROVE_SYSTEM,
            ).strip()
            for i, c in enumerate(chunks)
        ]

    if phase == "review":
        return {"text": "\n\n".join(c for c in review_all() if c)}

    if phase == "revise":
        return {"text": "\n\n".join(p for p in revise_all(body.critique.strip()) if p)}

    critique = "\n\n".join(c for c in review_all() if c)
    return {"text": "\n\n".join(p for p in revise_all(critique) if p)}


@app.post("/api/export")
def export(body: ExportIn):
    """Render the essay text as a downloadable file (docx/pdf/md/txt)."""
    return export_response(body.title, body.text, body.format)


# --- File import (text extraction from user-uploaded files) ---

MAX_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB
SUPPORTED_IMPORT_EXTS = {".txt", ".md", ".docx", ".pdf"}


def _decode_text(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1256"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise HTTPException(400, "Could not decode this text file. Please save it as UTF-8.")


def _extract_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
    except Exception:
        raise HTTPException(400, "Could not read this .docx file. It may be corrupted.")
    blocks = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            blocks.append(" ".join(cell.text.strip() for cell in row.cells))
    return "\n\n".join(b for b in blocks if b.strip())


def _extract_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [(page.extract_text() or "") for page in reader.pages]
    except Exception:
        raise HTTPException(400, "Could not read this .pdf file. It may be corrupted.")
    return "\n\n".join(pages)


@app.post("/api/import-file")
async def import_file(file: UploadFile = File(...)):
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_IMPORT_EXTS:
        raise HTTPException(
            400,
            f"Unsupported file type{' ' + ext if ext else ''}. "
            "Supported types: .txt, .md, .docx, .pdf",
        )

    # Reject oversized uploads without reading more than the limit allows.
    if file.size is not None and file.size > MAX_IMPORT_BYTES:
        raise HTTPException(413, "File too large. Maximum size is 10 MB.")

    data = await file.read()
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "File too large. Maximum size is 10 MB.")

    if ext in (".txt", ".md"):
        text = _decode_text(data)
    elif ext == ".docx":
        text = _extract_docx(data)
    else:
        text = _extract_pdf(data)
        if not text.strip():
            raise HTTPException(
                422, "No extractable text found. This looks like a scanned PDF."
            )

    return {
        "filename": filename,
        "text": text,
        "char_count": len(text),
        "word_count": len(text.split()),
    }


# --- Local / packaged entry point ---

# The Tauri UI only ever calls this server at 127.0.0.1:8765 (see essay-ui/src/api.ts).
HOST = "127.0.0.1"
DEFAULT_PORT = 8765


def _redirect_stdio_when_headless() -> None:
    """Keep logging alive when there is no console attached.

    A windowed PyInstaller build (--noconsole) leaves sys.stdout and sys.stderr
    set to None, and uvicorn's default logging writes to sys.stderr -- startup
    would fail before the first request. Send both streams to a log file under
    the user's temp folder instead, falling back to the null device.

    Only the server's own startup/access lines are written there: the default
    uvicorn access log records the method, path and status code, never request
    bodies, headers or API keys, and nothing else in this server logs at all.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return

    stream: TextIO
    try:
        log_dir = Path(tempfile.gettempdir()) / "essay-server"
        log_dir.mkdir(parents=True, exist_ok=True)
        stream = open(log_dir / "essay-server.log", "a", encoding="utf-8")
    except OSError:
        stream = open(os.devnull, "a", encoding="utf-8")

    if sys.stdout is None:
        sys.stdout = stream  # type: ignore[assignment]
    if sys.stderr is None:
        sys.stderr = stream  # type: ignore[assignment]


def _port_is_free(host: str, port: int) -> bool:
    """Probe the port before handing it to uvicorn so a conflict exits cleanly."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((host, port))
        except OSError:
            return False
    return True


if __name__ == "__main__":
    import uvicorn

    _redirect_stdio_when_headless()

    try:
        port = int(os.environ.get("ESSAY_SERVER_PORT", str(DEFAULT_PORT)))
    except ValueError:
        port = DEFAULT_PORT

    if not _port_is_free(HOST, port):
        print(
            f"essay-server: port {port} is already in use; stopping.",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)

    uvicorn.run(app, host=HOST, port=port, log_level="info")