#!/usr/bin/env python3
"""Stamp the GitHub Pages artifact with the exact deployed commit SHA.

A running installed PWA can compare the current build to app-version.json.
Versioned asset URLs also prevent stale browser HTTP caches from mixing
new HTML with older JavaScript, while the service worker retains offline
fallbacks under unversioned internal cache keys.
"""
import json
import os
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
public = root / "public"
sha = os.environ.get("GITHUB_SHA", "").lower()
if not re.fullmatch(r"[0-9a-f]{40}", sha):
    raise RuntimeError("GITHUB_SHA must be exactly a 40-character commit hash")
if not public.is_dir():
    raise RuntimeError("Pages public/ artifact is not prepared")

(public / "app-version.json").write_text(
    json.dumps({"build": sha}, separators=(",", ":")) + "\n", encoding="utf-8"
)
(public / "build-version.js").write_text(
    "window.LivekarteAppBuild=" + json.dumps(sha) + ";\n", encoding="utf-8"
)

assets = [
    ("href", "style.css"),
    ("href", "vendor/leaflet.css"),
    ("src", "vendor/leaflet.js"),
    ("src", "core.js"),
    ("src", "walking-core.js"),
    ("src", "day-plan-core.js"),
    ("src", "route-discovery.js"),
    ("src", "next-step-core.js"),
    ("src", "japanese-destination.js"),
    ("src", "app.js"),
    ("src", "sync.js"),
    ("src", "outbox-core.js"),
    ("src", "sync-out.js"),
    ("src", "build-version.js"),
    ("src", "pwa.js"),
]
html_path = public / "index.html"
html = html_path.read_text(encoding="utf-8")
# Fail deployment rather than silently publishing HTML that loads a missing
# first-party module. All local scripts must also be content-versioned.
script_sources = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', html)
missing_stamps = [src for src in script_sources if ("src", src) not in assets]
if missing_stamps:
    raise RuntimeError(f"Unstamped HTML scripts: {', '.join(missing_stamps)}")
for attr, asset in assets:
    if not (public / asset).is_file():
        raise RuntimeError(f"Missing Pages artifact asset: {asset}")
    needle = f'{attr}="{asset}"'
    if html.count(needle) != 1:
        raise RuntimeError(f"Expected exactly one {needle} in index.html")
    html = html.replace(needle, f'{attr}="{asset}?v={sha}"')
html_path.write_text(html, encoding="utf-8")
print(f"Stamped {len(assets)} assets with deployed SHA {sha[:12]}")
