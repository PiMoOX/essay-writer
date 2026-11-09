"""Essay text -> downloadable file conversion for the /api/export endpoint.

Text is treated as Markdown-ish:
  - "#", "##", "###" lines become headings
  - "-", "*", "+" and "N." lines become list items
  - blank lines separate paragraphs
  - **bold** and *italic* are honoured inline

docx and pdf output render Persian/Arabic correctly (RTL ordering, connected
glyphs, a Persian-capable font).
"""

import io
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, Response
from pydantic import BaseModel
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdf_canvas
import arabic_reshaper
from bidi import algorithm as bidi_algorithm

MAX_EXPORT_CHARS = 2 * 1024 * 1024  # 2 MB of text
EXPORT_FORMATS = ("docx", "pdf", "md", "txt")
RTL_PARAGRAPH_FONT = "Vazirmatn"
# In a PyInstaller --onefile build the fonts are bundled at the root of the
# extracted _MEIPASS folder (--add-data "fonts;fonts"); unfrozen, they sit next
# to this file.
if getattr(sys, "frozen", False) and getattr(sys, "_MEIPASS", None):
    FONTS_DIR = Path(sys._MEIPASS) / "fonts"
else:
    FONTS_DIR = Path(__file__).resolve().parent / "fonts"

# Arabic/Persian/Hebrew blocks plus Arabic presentation forms
_RTL_RANGES = (
    (0x0590, 0x05FF),
    (0x0600, 0x08FF),
    (0xFB1D, 0xFDFF),
    (0xFE70, 0xFEFF),
)

_HEADING_RE = re.compile(r"^(#{1,3})[ \t]+(.*?)[ \t]*$")
_ULIST_RE = re.compile(r"^[ \t]*[-*+][ \t]+(.*?)[ \t]*$")
_OLIST_RE = re.compile(r"^[ \t]*\d{1,3}[.)][ \t]+(.*?)[ \t]*$")
_EMPHASIS_RE = re.compile(r"(\*\*.+?\*\*|\*[^*]+?\*)")


class ExportIn(BaseModel):
    """POST /api/export request body."""

    title: str = ""
    text: str
    format: str


def is_rtl_text(text: str) -> bool:
    """True when the text holds mostly Arabic/Persian characters."""
    rtl = ltr = 0
    for ch in text:
        o = ord(ch)
        if any(lo <= o <= hi for lo, hi in _RTL_RANGES):
            rtl += 1
        elif ch.isascii() and ch.isalpha():
            ltr += 1
    return rtl > ltr and rtl > 0


def _inline_spans(text: str) -> list:
    """Split text into (bold, italic, plain) tuples."""
    spans = []
    for part in _EMPHASIS_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) >= 4:
            spans.append((True, False, part[2:-2]))
        elif part.startswith("*") and part.endswith("*") and len(part) >= 2:
            spans.append((False, True, part[1:-1]))
        else:
            spans.append((False, False, part))
    return spans or [(False, False, "")]


def _spans_text(spans) -> str:
    return "".join(s[2] for s in spans)


def parse_blocks(text: str) -> list:
    """Turn markdown-ish text into a list of block dicts.

    Each block is one of:
      {"kind": "h1"|"h2"|"h3"|"p", "spans": [(bold, italic, plain), ...]}
      {"kind": "ul"|"ol", "items": [[(bold, italic, plain), ...], ...]}
    """
    blocks = []
    para: list = []
    lst = None

    def close_para():
        if para:
            blocks.append({"kind": "p", "spans": _inline_spans(" ".join(para))})
            para.clear()

    def close_list():
        nonlocal lst
        if lst is not None:
            blocks.append(lst)
            lst = None

    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line:
            close_para()
            close_list()
            continue

        m = _HEADING_RE.match(line)
        if m:
            close_para()
            close_list()
            blocks.append({"kind": "h" + str(len(m.group(1))), "spans": _inline_spans(m.group(2))})
            continue

        m = _ULIST_RE.match(line)
        if m:
            close_para()
            if lst is None or lst["kind"] != "ul":
                close_list()
                lst = {"kind": "ul", "items": []}
            lst["items"].append(_inline_spans(m.group(1)))
            continue

        m = _OLIST_RE.match(line)
        if m:
            close_para()
            if lst is None or lst["kind"] != "ol":
                close_list()
                lst = {"kind": "ol", "items": []}
            lst["items"].append(_inline_spans(m.group(1)))
            continue

        close_list()
        para.append(line)

    close_para()
    close_list()
    return blocks


def sanitize_filename(title: str, ext: str) -> str:
    base = (title or "").strip()
    if base:
        base = unicodedata.normalize("NFKC", base)
        base = re.sub(r'[<>:"/\\|?*\x00-\x1F]', " ", base)
        base = " ".join(base.split())
    if not base:
        base = "essay"
    return base[:90] + "." + ext


def _ascii_fallback(title: str, ext: str) -> str:
    """ASCII-only filename for old clients that ignore filename*=."""
    base = unicodedata.normalize("NFKC", title or "").encode("ascii", "ignore").decode("ascii")
    base = re.sub(r'[^\x20-\x7E]', "", base).strip()
    return (base[:90] or "essay") + "." + ext


# --------------------------------------------------------------------- docx

_BIDI_SUCCESSORS = (
    "w:adjustRightInd", "w:snapToGrid", "w:spacing", "w:ind",
    "w:contextualSpacing", "w:mirrorIndents", "w:suppressOverlap", "w:jc",
    "w:textDirection", "w:textAlignment", "w:textboxTightWrap", "w:outlineLvl",
    "w:divId", "w:cnfStyle", "w:rPr", "w:sectPr", "w:pPrChange",
)


def _docx_rtl_run(run):
    """Mark a run as complex-script RTL and give it a Persian-capable font."""
    run.font.name = RTL_PARAGRAPH_FONT
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs"):
        rFonts.set(qn(attr), RTL_PARAGRAPH_FONT)
    rPr.append(OxmlElement("w:rtl"))


def _docx_rtl_paragraph(p):
    """Right-align a paragraph and set its reading direction to RTL."""
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    pPr = p._p.get_or_add_pPr()
    if pPr.find(qn("w:bidi")) is None:
        pPr.insert_element_before(OxmlElement("w:bidi"), *_BIDI_SUCCESSORS)


def _docx_add_runs(p, spans, rtl):
    for bold, italic, plain in spans:
        if not plain:
            continue
        run = p.add_run(plain)
        if bold:
            run.bold = True
        if italic:
            run.italic = True
        if rtl:
            _docx_rtl_run(run)


def _docx_restart_list(doc, first_paragraph):
    """Give an ordered list its own numbering instance so it starts at 1.

    The List Number style points every paragraph at one shared numId, so two
    separate lists in the same document would continue 1..4 instead of each
    starting at 1. We copy the abstract numbering under a fresh numId and pin
    it on the first paragraph of the list.
    """
    pPr = first_paragraph._p.get_or_add_pPr()
    numPr = pPr.find(qn("w:numPr"))
    num_id_elem = numPr.find(qn("w:numId")) if numPr is not None else None
    if num_id_elem is None:
        # Numbering comes from the paragraph style - look it up there.
        current_id = _docx_style_num_id(first_paragraph)
        if current_id is None:
            return
    else:
        current_id = num_id_elem.get(qn("w:val"))

    try:
        numbering = doc.part.numbering_part.element
    except Exception:
        return

    abstract = None
    for num in numbering.findall(qn("w:num")):
        if num.get(qn("w:numId")) == current_id:
            aid = num.find(qn("w:abstractNumId"))
            if aid is not None:
                abstract = aid.get(qn("w:val"))
            break
    if abstract is None:
        return

    new_id = str(max((int(n.get(qn("w:numId"))) for n in numbering.findall(qn("w:num"))), default=0) + 1)
    el = OxmlElement("w:num")
    el.set(qn("w:numId"), new_id)
    aid = OxmlElement("w:abstractNumId")
    aid.set(qn("w:val"), abstract)
    el.append(aid)
    numbering.append(el)

    # Put the override on the paragraph itself (w:numPr follows w:pStyle in pPr).
    if numPr is None:
        numPr = OxmlElement("w:numPr")
        pStyle = pPr.find(qn("w:pStyle"))
        if pStyle is not None:
            pStyle.addnext(numPr)
        else:
            pPr.insert(0, numPr)
        num_id_elem = OxmlElement("w:numId")
        numPr.append(num_id_elem)
    num_id_elem.set(qn("w:val"), new_id)


def _docx_style_num_id(paragraph):
    """The numId the paragraph's list style references, if any."""
    try:
        style_el = paragraph.style._element
    except Exception:
        return None
    s_pPr = style_el.find(qn("w:pPr"))
    if s_pPr is None:
        return None
    s_numPr = s_pPr.find(qn("w:numPr"))
    if s_numPr is None:
        return None
    el = s_numPr.find(qn("w:numId"))
    return el.get(qn("w:val")) if el is not None else None


def build_docx(title: str, text: str) -> bytes:
    doc = Document()

    if title and title.strip():
        p = doc.add_heading("", level=0)
        rtl = is_rtl_text(title)
        _docx_add_runs(p, _inline_spans(title.strip()), rtl)
        if rtl:
            _docx_rtl_paragraph(p)

    for block in parse_blocks(text):
        kind = block["kind"]
        if kind in ("h1", "h2", "h3"):
            p = doc.add_heading("", level=int(kind[1]))
            rtl = is_rtl_text(_spans_text(block["spans"]))
            _docx_add_runs(p, block["spans"], rtl)
            if rtl:
                _docx_rtl_paragraph(p)
        elif kind == "p":
            p = doc.add_paragraph()
            rtl = is_rtl_text(_spans_text(block["spans"]))
            _docx_add_runs(p, block["spans"], rtl)
            if rtl:
                _docx_rtl_paragraph(p)
        else:
            ordered = kind == "ol"
            first = True
            for item in block["items"]:
                p = doc.add_paragraph(style="List Number" if ordered else "List Bullet")
                rtl = is_rtl_text(_spans_text(item))
                if ordered and first:
                    _docx_restart_list(doc, p)
                first = False
                _docx_add_runs(p, item, rtl)
                if rtl:
                    _docx_rtl_paragraph(p)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


# ---------------------------------------------------------------------- pdf

_pdf_fonts_ready = False
_pdf_regular_ok = False
_pdf_bold_ok = False
PDF_FONT = "EssayFont"
PDF_FONT_BOLD = "EssayFont-Bold"


def _register_pdf_fonts() -> None:
    """Register a Persian-capable TTF: bundled Vazirmatn, then system fonts."""
    global _pdf_fonts_ready, _pdf_regular_ok, _pdf_bold_ok
    if _pdf_fonts_ready:
        return
    _pdf_fonts_ready = True

    sysroot = Path(os.environ.get("SystemRoot") or r"C:\Windows")
    candidates = {
        PDF_FONT: [
            FONTS_DIR / "Vazirmatn-Regular.ttf",
            sysroot / "Fonts" / "tahoma.ttf",
            sysroot / "Fonts" / "arial.ttf",
        ],
        PDF_FONT_BOLD: [
            FONTS_DIR / "Vazirmatn-Bold.ttf",
            sysroot / "Fonts" / "tahomabd.ttf",
            sysroot / "Fonts" / "arialbd.ttf",
        ],
    }
    for name, options in candidates.items():
        for path in options:
            if path.is_file():
                try:
                    pdfmetrics.registerFont(TTFont(name, str(path)))
                    if name == PDF_FONT:
                        _pdf_regular_ok = True
                    else:
                        _pdf_bold_ok = True
                except Exception:
                    continue
                break


def _pdf_font(bold: bool) -> str:
    if bold:
        return PDF_FONT_BOLD if _pdf_bold_ok else "Helvetica-Bold"
    return PDF_FONT if _pdf_regular_ok else "Helvetica"


def _shape(text: str) -> str:
    """Reshape Arabic/Persian glyphs and apply BiDi reordering for drawing."""
    return bidi_algorithm.get_display(arabic_reshaper.reshape(text))


def _split_word(word: str, bold: bool, size: float, max_w: float, sw) -> list:
    if sw(word, bold, size) <= max_w:
        return [word]
    parts = []
    cur = ""
    for ch in word:
        if cur and sw(cur + ch, bold, size) > max_w:
            parts.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        parts.append(cur)
    return parts


def _wrap_tokens(tokens: list, size: float, max_w: float, sw) -> list:
    """Wrap (bold, word) tokens into lines that fit max_w points."""
    space = sw(" ", False, size)
    lines = []
    cur: list = []
    cur_w = 0.0
    for bold, word in tokens:
        for piece in _split_word(word, bold, size, max_w, sw):
            w = sw(piece, bold, size)
            step = w + (space if cur else 0)
            if cur and cur_w + step > max_w + 0.01:
                lines.append(cur)
                cur = [(bold, piece)]
                cur_w = w
            else:
                cur.append((bold, piece))
                cur_w += step
    if cur:
        lines.append(cur)
    return lines or [[(False, "")]]


def build_pdf(title: str, text: str) -> bytes:
    stringWidth = pdfmetrics.stringWidth

    _register_pdf_fonts()

    def sw(s: str, bold: bool, size: float) -> float:
        return stringWidth(s, _pdf_font(bold), size)

    page_w, page_h = A4
    margin = 54
    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    if title and title.strip():
        c.setTitle(title.strip()[:200])
    state = {"y": page_h - margin}

    def new_page():
        c.showPage()
        state["y"] = page_h - margin

    def ensure(height: float):
        if state["y"] - height < margin:
            new_page()

    def draw_line(tokens, size, leading, rtl, x_left, x_right, center=False):
        space = sw(" ", False, size)
        for line in _wrap_tokens(tokens, size, x_right - x_left, sw):
            ensure(leading)
            yb = state["y"]
            runs = []
            for bold, word in line:
                if runs and runs[-1][0] == bold:
                    runs[-1][1].append(word)
                else:
                    runs.append((bold, [word]))
            if len(runs) == 1:
                bold, words = runs[0]
                vis = _shape(" ".join(words))
                w = stringWidth(vis, _pdf_font(bold), size)
                x = (page_w - w) / 2 if center else ((x_right - w) if rtl else x_left)
                c.setFont(_pdf_font(bold), size)
                c.drawString(x, yb, vis)
            else:
                vis_runs = [(b, _shape(" ".join(ws))) for b, ws in runs]
                total = sum(
                    stringWidth(v, _pdf_font(b), size) for b, v in vis_runs
                ) + space * (len(vis_runs) - 1)
                x = (page_w - total) / 2 if center else ((x_right - total) if rtl else x_left)
                for b, v in (list(reversed(vis_runs)) if rtl else vis_runs):
                    c.setFont(_pdf_font(b), size)
                    c.drawString(x, yb, v)
                    x += stringWidth(v, _pdf_font(b), size) + space
            state["y"] = yb - leading

    def spans_tokens(spans):
        tokens = []
        for bold, italic, plain in spans:
            for word in plain.split(" "):
                if word:
                    tokens.append((bold, word))
        return tokens or [(False, "")]

    HEADING_STYLE = {"h1": (17, 21), "h2": (14, 18), "h3": (12.5, 16)}

    if title and title.strip():
        draw_line(spans_tokens([(True, False, title.strip())]), 22, 27,
                  is_rtl_text(title), margin, page_w - margin, center=True)
        state["y"] -= 12

    for block in parse_blocks(text):
        kind = block["kind"]
        if kind in HEADING_STYLE:
            size, leading = HEADING_STYLE[kind]
            state["y"] -= 8
            draw_line([(True, w) for _, w in spans_tokens(block["spans"])], size, leading,
                      is_rtl_text(_spans_text(block["spans"])), margin, page_w - margin)
            state["y"] -= 5
        elif kind == "p":
            draw_line(spans_tokens(block["spans"]), 11, 15.5,
                      is_rtl_text(_spans_text(block["spans"])), margin, page_w - margin)
            state["y"] -= 6
        else:
            ordered = kind == "ol"
            indent = 18
            space_w = sw(" ", False, 11)
            items = block["items"]
            for i, item in enumerate(items):
                marker = ("%d." % (i + 1)) if ordered else "•"
                mw = sw(marker, False, 11)
                x_left = margin + indent
                x_right = page_w - margin - indent
                rtl = is_rtl_text(_spans_text(item))
                ensure(15.5)
                # Draw the bullet/number on the first line's baseline, then wrap
                # the item text in the space left of it.
                if rtl:
                    c.setFont(_pdf_font(False), 11)
                    c.drawString(x_right - mw, state["y"], marker)
                    draw_line(spans_tokens(item), 11, 15.5, True,
                              x_left, x_right - mw - space_w)
                else:
                    c.setFont(_pdf_font(False), 11)
                    c.drawString(x_left, state["y"], marker)
                    draw_line(spans_tokens(item), 11, 15.5, False,
                              x_left + mw + space_w, x_right)
            state["y"] -= 4

    c.save()
    return buf.getvalue()


# --------------------------------------------------------------- the helper

def export_response(title: str, text: str, fmt: str) -> Response:
    fmt = (fmt or "").strip().lower()
    if fmt not in EXPORT_FORMATS:
        raise HTTPException(
            400,
            "Unsupported format%s. Use one of: %s."
            % (" '%s'" % fmt if fmt else "", ", ".join(EXPORT_FORMATS)),
        )
    if not text or not text.strip():
        raise HTTPException(400, "Nothing to export: the essay text is empty.")
    if len(text) > MAX_EXPORT_CHARS:
        raise HTTPException(400, "The text is too long to export (2 MB limit).")

    if fmt == "docx":
        data = build_docx(title, text)
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif fmt == "pdf":
        data = build_pdf(title, text)
        mime = "application/pdf"
    elif fmt == "txt":
        data = b"\xef\xbb\xbf" + text.encode("utf-8")
        mime = "text/plain; charset=utf-8"
    else:
        data = text.encode("utf-8")
        mime = "text/markdown; charset=utf-8"

    filename = sanitize_filename(title, fmt)
    disposition = (
        'attachment; filename="%s"; filename*=UTF-8\'\'%s'
        % (_ascii_fallback(title, fmt), quote(filename, safe=""))
    )
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": disposition},
    )
