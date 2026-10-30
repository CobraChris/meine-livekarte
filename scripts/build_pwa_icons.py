#!/usr/bin/env python3
"""Render the approved C-route icon as standard installable Android PWA PNG sizes.
Run in the Pages publish job with CairoSVG==2.8.2 in a temporary virtualenv.
The checked-in SVG remains the human-editable, fully local source of truth.
No network requests or runtime dependency inside the published web app.
"""
from pathlib import Path
import struct
import xml.etree.ElementTree as ET

import cairosvg

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "icons" / "livekarte.svg"
OUTPUT = ROOT / "public" / "icons"
OUTPUT.mkdir(parents=True, exist_ok=True)
ET.parse(SOURCE)
for filename, pixels in [
    ("livekarte-192.png", 192),
    ("livekarte-512.png", 512),
    ("livekarte-maskable-512.png", 512),
]:
    target = OUTPUT / filename
    cairosvg.svg2png(
        url=str(SOURCE), write_to=str(target),
        output_width=pixels, output_height=pixels,
    )
    content = target.read_bytes()
    if content[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", content[16:24]) != (pixels, pixels):
        raise RuntimeError(f"Invalid PWA icon: {target}")
    print(f"Created {target} ({pixels} x {pixels}, {len(content)} bytes)")
