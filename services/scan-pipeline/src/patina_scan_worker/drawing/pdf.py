"""SVG → PDF via cairosvg (design §9 open-question-1, blessed). Each sheet's SVG
is authored at the print scale (Letter, points), so the PDF is at the stated
architectural scale with no extra transform.

cairosvg needs native cairo — on the Linux worker box `apt install libcairo2`
(install.sh does this); on macOS dev, `brew install cairo` +
`DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`. Import is lazy so the worker
module still loads where PDF isn't exercised.
"""

from __future__ import annotations


def svg_to_pdf(svg: str) -> bytes:
    import cairosvg  # lazy: native cairo dependency

    return cairosvg.svg2pdf(bytestring=svg.encode("utf-8"))
