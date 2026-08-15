"""Build square icon-source.png from logo-abstract.png, then run `npm run tauri icon`."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "src-tauri" / "icons"
SRC = ICONS / "logo-abstract.png"
OUT = ICONS / "icon-source.png"


def main() -> int:
    try:
        from PIL import Image
    except ImportError:
        print("Install Pillow: py -m pip install Pillow", file=sys.stderr)
        return 1

    if not SRC.is_file():
        print(f"Missing {SRC}", file=sys.stderr)
        return 1

    logo = Image.open(SRC).convert("RGBA")
    size = 1024
    padding = 96
    max_dim = size - 2 * padding
    w, h = logo.size
    scale = min(max_dim / w, max_dim / h)
    new_w, new_h = int(w * scale), int(h * scale)
    logo = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    canvas.paste(logo, ((size - new_w) // 2, (size - new_h) // 2), logo)
    canvas.save(OUT)
    print(f"Wrote {OUT} ({size}x{size})")

    subprocess.run(
        ["npm", "run", "tauri", "icon", str(OUT.relative_to(ROOT)).replace("\\", "/")],
        cwd=ROOT,
        check=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
