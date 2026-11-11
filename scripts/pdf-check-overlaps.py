"""Detect overlapping text in a rendered PDF.

Two text spans that overlap vertically and horizontally are a layout
bug: one is drawn on top of the other. This checks every page and
reports each overlap, so the layout can be verified rather than
eyeballed.

Usage: python scripts/pdf-check-overlaps.py <pdf-path>
"""

import sys
import pathlib
import pymupdf

pdf_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "logs/pdf-report-smoke.pdf")
doc = pymupdf.open(pdf_path)

total = 0

for index, page in enumerate(doc):
    spans = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                if not text:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                # PyMuPDF reports the full font box, which for a large
                # font is far taller than the glyphs that are actually
                # drawn. The real ink sits between the cap height and
                # the descender of the baseline, so the box is shrunk
                # to that before comparing.
                size = span["size"]
                baseline = span["origin"][1]
                top = baseline - size * 0.73
                bottom = baseline + size * 0.22
                spans.append((x0, top, x1, bottom, text))

    for i in range(len(spans)):
        ax0, ay0, ax1, ay1, atext = spans[i]
        for j in range(i + 1, len(spans)):
            bx0, by0, bx1, by1, btext = spans[j]

            # A real overlap needs both axes to intersect by more than a
            # hair, otherwise touching glyphs count as a false positive.
            ox = min(ax1, bx1) - max(ax0, bx0)
            oy = min(ay1, by1) - max(ay0, by0)
            if ox > 1.0 and oy > 1.0:
                total += 1
                print(f"PAGE {index + 1}: OVERLAP ({ox:.1f} x {oy:.1f} pt)")
                print(f"   A {atext[:60]!r}")
                print(f"     bbox=({ax0:.1f},{ay0:.1f})-({ax1:.1f},{ay1:.1f})")
                print(f"   B {btext[:60]!r}")
                print(f"     bbox=({bx0:.1f},{by0:.1f})-({bx1:.1f},{by1:.1f})")

print(f"\n{total} overlapping span pair(s) found in {pdf_path.name}")