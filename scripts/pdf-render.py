"""Render a PDF to PNGs and dump its text, so the layout can be checked.

Usage: python scripts/pdf-render.py <pdf-path> [out-dir]
"""

import sys
import pathlib
import pymupdf

pdf_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "logs/pdf-report-smoke.pdf")
out_dir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "logs/pdf-render")
out_dir.mkdir(parents=True, exist_ok=True)

doc = pymupdf.open(pdf_path)
print(f"pages: {doc.page_count}")
print(f"metadata title: {doc.metadata.get('title')}")

for index, page in enumerate(doc):
    pix = page.get_pixmap(dpi=110)
    target = out_dir / f"page-{index + 1:02d}.png"
    pix.save(target)
    print(f"page {index + 1}: {target}")

full_text = "\n\n".join(f"===== PAGE {i + 1} =====\n{p.get_text()}" for i, p in enumerate(doc))
text_file = out_dir / "text.txt"
text_file.write_text(full_text, encoding="utf-8")
print(f"text written: {text_file} ({len(full_text)} chars)")
