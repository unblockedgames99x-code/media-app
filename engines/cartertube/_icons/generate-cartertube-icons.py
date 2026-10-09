"""Build CarterTube's vector branding and application icons.

Requires Pillow, fonttools, and sharp. The source font is Outfit Variable
(SIL OFL 1.1); supply its location with --font. No font binary is copied.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--font", required=True, type=Path)
parser.add_argument("--node", default="node")
parser.add_argument("--sharp", default="sharp")
parser.add_argument("--tool-dir", type=Path)
args = parser.parse_args()
if args.tool_dir:
    sys.path.insert(0, str(args.tool_dir.resolve()))

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image

icons = Path(__file__).resolve().parent
repo = icons.parent
renderer = repo / "src/renderer/assets/img"
renderer.mkdir(parents=True, exist_ok=True)

CORAL = "#ff414c"
PAPER = "#f6f4f4"
INK = "#111114"
META = (
    "CarterTube: original C-and-play artwork, 2026. "
    "Wordmark outlines: Copyright 2021 The Outfit Project Authors "
    "(https://github.com/Outfitio/Outfit-Fonts); SIL Open Font License 1.1. "
    "FreeTube application attribution and AGPL-3.0 license remain in the repository."
)

font = instantiateVariableFont(TTFont(args.font), {"wght": 650}, inplace=True)
glyphs = font.getGlyphSet()
mapping = font.getBestCmap()
units = font["head"].unitsPerEm


def word_paths(word: str, color: str, x=0, baseline=0, size=100):
    result = []
    cursor = x
    scale = size / units
    for char in word:
        name = mapping[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        result.append(
            f'<path fill="{color}" transform="translate({cursor:.4f} {baseline}) '
            f'scale({scale:.6f} {-scale:.6f})" d="{pen.getCommands()}"/>'
        )
        cursor += font["hmtx"][name][0] * scale - size * 0.018
    return "".join(result), cursor


def mark(color=CORAL, play=PAPER, tile=True):
    # The open C and simple, rounded play silhouette remain clear at 16px.
    background = (
        f'<rect x="4" y="4" width="120" height="120" rx="32" fill="{INK}"/>'
        '<rect x="4.5" y="4.5" width="119" height="119" rx="31.5" '
        'fill="none" stroke="#ffffff" stroke-opacity=".09"/>'
        if tile else ""
    )
    return (
        background
        + f'<path d="M86 34 A37 37 0 1 0 86 94" fill="none" stroke="{color}" '
        'stroke-width="11" stroke-linecap="round"/>'
        + f'<path d="M60 47 Q57 45.3 57 49 V79 Q57 82.7 60 81 L86 66.6 '
        f'Q90.5 64 86 61.4 Z" fill="{play}"/>'
    )


def svg(content, width, height, viewbox=None, title="CarterTube"):
    viewbox = viewbox or f"0 0 {width} {height}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="{viewbox}" role="img" aria-label="{title}">'
        f'<title>{title}</title><metadata>{META}</metadata>{content}</svg>\n'
    )


def write(path, value):
    path.write_text(value, encoding="utf-8")


def wordmark(color=PAPER, accent=CORAL, width=100, height=49):
    # Retain the existing theme SVG's box so current navigation remains aligned.
    first, advance = word_paths("Carter", color, size=100)
    second, end = word_paths("Tube", accent, x=advance, size=100)
    fit = (width - 3) / end
    content = f'<g transform="translate(1.5 33.5) scale({fit:.6f})">{first}{second}</g>'
    return svg(content, width, height, title="CarterTube wordmark")


def full_logo(color=PAPER):
    first, advance = word_paths("Carter", color, x=156, baseline=95, size=82)
    second, end = word_paths("Tube", CORAL, x=advance, baseline=95, size=82)
    return svg(mark() + first + second, round(end + 10), 128)


# Reuse theme colors to preserve every existing FreeTube theme choice.
theme_colors = {}
for path in icons.glob("icon*Small.svg"):
    existing = path.read_text(encoding="utf-8")
    found = re.findall(r"#[0-9a-fA-F]{3,8}", existing)
    theme_colors[path.name] = found[0] if found else "#000000"

for name, color in theme_colors.items():
    is_color = name == "iconColorSmall.svg"
    write(icons / name, svg(mark() if is_color else mark(color, color, False), 25, 25, "0 0 128 128"))

for path in icons.glob("text*Small.svg"):
    icon_name = path.name.replace("text", "icon", 1)
    color = theme_colors.get(icon_name, PAPER)
    is_color = path.name == "textColorSmall.svg"
    write(path, wordmark(INK if is_color else color, CORAL if is_color else color))

master = svg(mark(), 128, 128)
write(icons / "icon.svg", master)
write(icons / "iconFlathub.svg", master)
write(icons / "logoColor.svg", full_logo())
write(renderer / "cartertube-mark.svg", master)
write(renderer / "cartertube-symbol.svg", svg(mark(tile=False), 128, 128))
write(renderer / "cartertube-logo.svg", full_logo())
write(renderer / "cartertube-logo-light.svg", full_logo(INK))

# Rasterize the canonical SVG so the installer, taskbar, and renderer match.
render = """
const sharp = require(process.argv[1]);
const source = process.argv[2];
const output = process.argv[3];
const size = Number(process.argv[4]);
sharp(source).resize(size, size).png().toFile(output).catch(error => {
  process.stderr.write(String(error)); process.exitCode = 1;
});
"""
subprocess.run([args.node, "-e", render, args.sharp, str(icons / "icon.svg"),
                str(icons / "iconColor.png"), "1024"], check=True)
logo_render = """
const sharp = require(process.argv[1]);
sharp(process.argv[2]).png().toFile(process.argv[3]).catch(error => {
  process.stderr.write(String(error)); process.exitCode = 1;
});
"""
subprocess.run([args.node, "-e", logo_render, args.sharp,
                str(icons / "logoColor.svg"), str(icons / "logoColor.png")], check=True)
with Image.open(icons / "iconColor.png") as source:
    source.save(icons / "icon.ico", format="ICO", sizes=[(s, s) for s in [16, 24, 32, 48, 64, 128, 256]])
    source.save(icons / "iconMac.icns", format="ICNS")
    source.resize((512, 512), Image.Resampling.LANCZOS).save(renderer / "cartertube-mark.png")
    source.resize((16, 16), Image.Resampling.LANCZOS).save(icons / "favicon-16.png")
    source.resize((32, 32), Image.Resampling.LANCZOS).save(icons / "favicon-32.png")

print(json.dumps({"icon": str(icons / "icon.svg"), "png": str(icons / "iconColor.png"),
                  "ico": str(icons / "icon.ico"), "themes": len(theme_colors)}))
