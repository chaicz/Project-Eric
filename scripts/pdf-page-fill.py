"""Report the vertical extent of the content on every PDF page.

A large gap at the bottom of a page means the layout left a hole, which
reads as a formatting mistake. The script prints the content bottom and
the gap to the footer rule for each page.

Usage: set PDF_PATH=<file> then run: python scripts/pdf-page-fill.py
"""

import os
import pathlib
import pymupdf

pdf_path = pathlib.Path(os.environ.get("PDF_PATH", "logs/pdf-report-smoke.pdf"))
doc = pymupdf.open(pdf_path)

PAGE_H = 841.89
FOOTER_RULE = PAGE_H - 46

print(f"{'page':>5} {'top':>7} {'bottom':>7} {'gap':>7}  first line")
for index, page in enumerate(doc):
    tops = []
    bottoms = []
    first = ""
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                if not span["text"].strip():
                    continue
                x0, y0, x1, y1 = span["bbox"]
                if y1 > FOOTER_RULE:
                    continue  # the footer itself
                tops.append(y0)
                bottoms.append(y1)
                if not first:
                    first = span["text"].strip()
    if not bottoms:
        print(f"{index + 1:>5} {'-':>7} {'-':>7} {'-':>7}  (empty)")
        continue
    top = min(tops)
    bottom = max(bottoms)
    gap = FOOTER_RULE - bottom
    print(f"{index + 1:>5} {top:>7.1f} {bottom:>7.1f} {gap:>7.1f}  {first[:44]}")
