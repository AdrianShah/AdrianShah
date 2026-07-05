#!/usr/bin/env python3
"""
Generates 'ancient drachma coin' styled SVG badges for the tech stack.
Run once locally if you want to add/change a tech coin:
    python3 scripts/generate_coin_badges.py
Each coin bobs gently via a native SMIL <animateTransform> (no external
CSS/JS needed, so the animation survives being embedded as a plain
<img> in GitHub's README renderer).
"""
import os

COINS = [
    {"id": "react", "label": "REACT", "delay": "0s"},
    {"id": "nextjs", "label": "NEXT.JS", "delay": "0.4s"},
    {"id": "framer", "label": "FRAMER MOTION", "delay": "0.8s"},
    {"id": "tailwind", "label": "TAILWIND", "delay": "1.2s"},
]

TEMPLATE = """<svg width="130" height="150" viewBox="0 0 130 150" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="coinFace-{id}" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#f5deA0"/>
      <stop offset="55%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#8a6a1e"/>
    </radialGradient>
    <linearGradient id="coinRim-{id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff3c4"/>
      <stop offset="100%" stop-color="#7a5a15"/>
    </linearGradient>
  </defs>
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="0,0; 0,-6; 0,0" dur="2.6s" begin="{delay}" repeatCount="indefinite" additive="sum"/>
    <circle cx="65" cy="65" r="52" fill="url(#coinRim-{id})"/>
    <circle cx="65" cy="65" r="45" fill="url(#coinFace-{id})" stroke="#5c430f" stroke-width="1.5"/>
    <circle cx="65" cy="65" r="38" fill="none" stroke="#7a5a15" stroke-width="1" stroke-dasharray="2,3" opacity="0.6"/>
    <text x="65" y="60" text-anchor="middle" font-family="Georgia, serif" font-weight="bold"
      font-size="13" fill="#3a2a08">{label_line1}</text>
    <text x="65" y="76" text-anchor="middle" font-family="Georgia, serif" font-weight="bold"
      font-size="13" fill="#3a2a08">{label_line2}</text>
  </g>
  <text x="65" y="140" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="#d4af37">{label}</text>
</svg>
"""

def split_label(label):
    words = label.split(" ")
    if len(words) == 1:
        return words[0], ""
    mid = len(words) // 2 or 1
    return " ".join(words[:mid]), " ".join(words[mid:])

def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "badges")
    os.makedirs(out_dir, exist_ok=True)
    for coin in COINS:
        l1, l2 = split_label(coin["label"])
        svg = TEMPLATE.format(id=coin["id"], delay=coin["delay"], label=coin["label"],
                               label_line1=l1, label_line2=l2)
        path = os.path.join(out_dir, f"{coin['id']}.svg")
        with open(path, "w") as f:
            f.write(svg)
        print(f"wrote {path}")

if __name__ == "__main__":
    main()
