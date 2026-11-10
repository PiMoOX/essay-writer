# ✍️ Essay Writer

An AI-powered desktop app that writes essays from a topic, or improves essays you already have. Bring your own OpenAI-compatible API key and Base URL, and a team of agents (**Draft → Review → Revise**) does the rest.

Built with **Tauri + React + TypeScript** (UI) and **FastAPI** (local backend, bundled inside the app).

## 📥 Download

👉 **[Download the latest Windows installer](https://github.com/PiMoOX/essay-writer/releases/latest)**

1. Download `EssayWriter-vX.Y.Z-windows.zip` from **Releases** and unzip it.
2. Run the `*-setup.exe` file.
3. If Windows SmartScreen shows *"Unknown publisher"*, click **More info → Run anyway** (the app is not code-signed).
4. Open the app, click the ⚙️ **Settings** icon, and enter your **API Key** and **Base URL**.

> Note: the **Download ZIP** button on the green *Code* menu only contains the source code, not the installer. Use **Releases** for the ready-to-install app.

## ✨ Features

- **Write from a topic**: enter a topic and the agents produce a draft, review it, and revise it.
- **Improve my essay**: click the 📎 icon to paste your own essay or import a file, add an optional instruction (e.g. *"make the tone more formal"*), and let the agents review and revise it.
- **Import files**: `.txt`, `.md`, `.docx`, `.pdf` (button or drag & drop).
- **Refine with your own instructions**, with full **Undo / Redo** version history.
- **Export** the final essay to **Word (.docx)**, **PDF**, **Markdown**, or **Text**, for both written and improved essays.
- **Library** of saved essays.
- **Persian / RTL support** in the editor, import, and exports (Word and PDF).
- Works with any **OpenAI-compatible** API (custom Base URL).

## 🧱 Project structure

```
essay-app/
├── backend/          # FastAPI server (agents, import, export)
│   ├── server.py
│   ├── export.py
│   └── build_server.bat
├── essay-ui/         # Tauri + Vite + React + TypeScript app
│   ├── src/          # UI code
│   ├── src-tauri/    # Rust shell, sidecar config, capabilities
│   └── scripts/      # helper scripts (copy-server.bat)
├── essay_agents.ipynb  # original notebook prototype
├── requirements.txt
└── .env.example
```

## 🛠️ Build from source

### Requirements

- [Python 3.10+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/)
- [Rust](https://rustup.rs/) and the Tauri prerequisites for Windows (WebView2, Visual Studio Build Tools with *Desktop development with C++*)

### 1. Backend

```bash
cd backend
pip install -r ../requirements.txt
```

To run the backend on its own (useful for debugging):

```bash
python -m uvicorn server:app --port 8765
```

### 2. Build the backend as a sidecar executable

The installed app launches the backend automatically as a Tauri *sidecar*, so it has to be packaged first:

```bash
pip install pyinstaller
cd backend
python -m PyInstaller --onefile --name essay-backend --collect-all reportlab --collect-all arabic_reshaper --collect-all docx --collect-all uvicorn server.py
```

If you have a `backend/fonts/` folder, add `--add-data "fonts;fonts"` before `server.py`.

Copy the result to the Tauri binaries folder using the exact name Tauri expects:

```bash
copy dist\essay-backend.exe ..\essay-ui\src-tauri\binaries\essay-server-x86_64-pc-windows-msvc.exe
```

The file should be roughly 100 MB. If it is only a few hundred KB, it is the wrong file.

### 3. Run the app in development

```bash
cd essay-ui
npm install
npm run tauri dev
```

The sidecar starts the backend automatically on **port 8765**, so make sure nothing else is using that port.

### 4. Build the installer

```bash
npm run tauri build
```

The installers are created in `essay-ui/src-tauri/target/release/bundle/` (`nsis/` and `msi/`).

> After any change to `backend/server.py`, rebuild the sidecar (step 2) and copy it again before building the app.

## ⚙️ Configuration

API Key, Base URL, and model are set from the **Settings** screen inside the app. For running the backend standalone, copy `.env.example` to `.env` and fill in your values. Never commit your `.env` file.

## 🧩 Tech stack

| Part | Technology |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| UI | React, TypeScript, Vite, Tailwind CSS, lucide-react |
| Backend | FastAPI, Uvicorn, OpenAI SDK |
| File import | python-docx, pypdf |
| File export | python-docx, ReportLab, arabic-reshaper, python-bidi |
| Packaging | PyInstaller (sidecar), Tauri bundler (NSIS / MSI) |

## 🩺 Troubleshooting

- **"Cannot reach the local server. Is it running on port 8765?"**: the backend did not start. Check that port 8765 is free (`netstat -ano | findstr :8765`) and that the sidecar file is the real ~100 MB build.
- **First launch is slow**: the bundled backend unpacks itself on first run and can take 10–30 seconds.
- **Antivirus warning**: PyInstaller executables sometimes trigger false positives. Allow the app if you trust the source.
- **Scanned PDFs**: image-only PDFs have no extractable text and can't be imported (OCR is not supported yet).

## 🗺️ Roadmap

- Live streaming of the text while writing
- Diff view between versions
- Saving Improve versions to the Library
- OCR for scanned PDFs, legacy `.doc` support

## 📄 License

[MIT](LICENSE)

---

## 🇮🇷 خلاصه به فارسی

**Essay Writer** یک اپ دسکتاپ برای نوشتن و بهینه‌سازی مقاله با هوش مصنوعی است. با وارد کردن API Key و Base URL (سازگار با OpenAI)، ایجنت‌ها مقاله را می‌نویسند (پیش‌نویس ← بازبینی ← اصلاح).

**قابلیت‌ها:** نوشتن مقاله از روی موضوع، بهینه‌سازی مقاله‌ی خودتان (با ورود فایل `.txt`، `.md`، `.docx`، `.pdf` یا paste)، اصلاح با دستور دلخواه همراه با Undo/Redo، خروجی گرفتن به Word، PDF، Markdown و Text، کتابخانه‌ی مقاله‌ها، و پشتیبانی کامل از فارسی و راست‌چین.

**نصب:** از بخش [Releases](https://github.com/PiMoOX/essay-writer/releases/latest) فایل zip را دانلود کنید، از حالت فشرده خارج کنید و فایل `setup.exe` را اجرا کنید. اگر ویندوز هشدار «Unknown publisher» داد، روی **More info ← Run anyway** بزنید. سپس از آیکون تنظیمات، API Key و Base URL را وارد کنید.
