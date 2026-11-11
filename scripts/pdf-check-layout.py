"""Find genuine layout defects in a rendered PDF.

Only real problems are reported:
  1. a text span that crosses the edge of a filled panel (so it sits
     half in, half out)
  2. a text span that crosses the edge of the page margins
  3. a filled panel or text that runs past the bottom margin
  4. two text spans that overlap each other

Usage: set PDF_PATH=<file> then run: python scripts/pdf-check-layout.py
"""

import os
import pathlib
import pymupdf

pdf_path = pathlib.Path(os.environ.get("PDF_PATH", "logs/pdf-report-smoke.pdf"))
doc = pymupdf.open(pdf_path)

PAGE_W, PAGE_H = 595.28, 841.89
MARGIN = 48
FOOTER_Y = PAGE_H - 46
problems = 0


def cross(a0, a1, b0, b1):
    """Overlap of two intervals, and whether the crossing is partial."""
    lo = max(a0, b0)
    hi = min(a1, b1)
    return lo, hi, hi - lo


for index, page in enumerate(doc):
    panels = []
    for d in page.get_drawings():
        r = d["rect"]
        if d.get("fill") is None:
            continue
        if r.width < 100 or r.height < 20:
            continue
        panels.append(r)

    spans = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                if not span["text"].strip():
                    continue
                x0, y0, x1, y1 = span["bbox"]
                spans.append((x0, y0, x1, y1, span["text"].strip()))

    # 1. text crossing a panel edge
    for (x0, y0, x1, y1, text) in spans:
        for r in panels:
            ox0, ox1, ox = cross(x0, x1, r.x0, r.x1)
            oy0, oy1, oy = cross(y0, y1, r.y0, r.y1)
            if ox <= 0.5 or oy <= 0.5:
                continue
            # Fully inside the panel is fine. A crossing means the span
            # starts inside and ends outside, or the other way round.
            inside = x0 >= r.x0 - 1 and x1 <= r.x1 + 1 and y0 >= r.y0 - 1 and y1 <= r.y1 + 1
            if inside:
                continue
            print(
                f"PAGE {index+1}: EDGE-CROSS {text[:60]!r} "
                f"span=({x0:.0f},{y0:.0f})-({x1:.0f},{y1:.0f}) "
                f"panel=({r.x0:.0f},{r.y0:.0f})-({r.x1:.0f},{r.y1:.0f})"
            )
            problems += 1

    # 2. text crossing the page margins
    for (x0, y0, x1, y1, text) in spans:
        if x1 > PAGE_W - MARGIN + 2:
            print(f"PAGE {index+1}: MARGIN-RIGHT {text[:60]!r} x1={x1:.1f}")
            problems += 1
        if x0 < MARGIN - 2:
            print(f"PAGE {index+1}: MARGIN-LEFT {text[:60]!r} x0={x0:.1f}")
            problems += 1
        if y1 > FOOTER_Y and y0 < PAGE_H - 60:
            print(f"PAGE {index+1}: FOOTER-CLASH {text[:60]!r} bottom={y1:.1f}")
            problems += 1

    # 3. a panel that runs off the bottom of the page
    for r in panels:
        if r.y1 > PAGE_H - MARGIN + 10:
            print(f"PAGE {index+1}: PANEL-OVERFLOW panel bottom={r.y1:.1f}")
            problems += 1

    # 4. text overlapping text
    for i in range(len(spans)):
        ax0, ay0, ax1, ay1, at = spans[i]
        for j in range(i + 1, len(spans)):
            bx0, by0, bx1, by1, bt = spans[j]
            ox = min(ax1, bx1) - max(ax0, bx0)
            oy = min(ay1, by1) - max(ay0, by0)
            if ox > 1.0 and oy > 1.0:
                print(f"PAGE {index+1}: TEXT-OVERLAP {at[:40]!r} vs {bt[:40]!r}")
                problems += 1

print(f"\n{problems} genuine layout problem(s) in {pdf_path.name}")
