#!/usr/bin/env python3
"""Inline all <script src="..."> modules of index.html into a single
self-contained HTML file — easy to send to a phone for test deployment.

Usage:  python3 build.py           ->  dist/seed-and-sage.html
"""
import re, pathlib

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")

def inline(match):
    src = match.group(1)
    js = (root / src).read_text(encoding="utf-8")
    # a lone </script> inside a JS string would end the tag early; none of our
    # modules contain one, but guard anyway
    js = js.replace("</script>", "<\\/script>")
    return "<script>\n/* ==== inlined from %s ==== */\n%s\n</script>" % (src, js)

out = re.sub(r'<script src="([^"]+)"></script>', inline, html)

dist = root / "dist"
dist.mkdir(exist_ok=True)
target = dist / "seed-and-sage.html"
target.write_text(out, encoding="utf-8")
print(f"built {target} ({target.stat().st_size/1024:.0f} KB)")
