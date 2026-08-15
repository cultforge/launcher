"""Generate short OLED ambient MP4 loops for the launcher background."""
import math
import random
from pathlib import Path

import imageio.v3 as iio
import numpy as np

OUT = Path(__file__).resolve().parents[1] / "public" / "bg"
W, H = 960, 540
FPS = 24
N = 96  # ~4s


def soft_blob(y, x, cy, cx, r, strength):
    return strength * np.exp(-((y - cy) ** 2 + (x - cx) ** 2) / (2 * r * r))


def make_void():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rng = random.Random(7)
    blobs = [
        (
            rng.uniform(0, H),
            rng.uniform(0, W),
            rng.uniform(60, 160),
            rng.uniform(0.15, 0.45),
            rng.uniform(0.2, 0.8),
            rng.choice([0, 1, 2]),
        )
        for _ in range(14)
    ]
    frames = []
    for i in range(N):
        t = i / FPS
        g = np.zeros((H, W), np.float32)
        b = np.zeros((H, W), np.float32)
        r = np.zeros((H, W), np.float32)
        for cy0, cx0, rad, stren, speed, kind in blobs:
            ang = t * speed * 0.7 + cy0 * 0.01
            cy = (cy0 + math.sin(ang) * 40) % H
            cx = (cx0 + math.cos(ang * 0.8) * 55) % W
            field = soft_blob(yy, xx, cy, cx, rad, stren)
            if kind == 0:
                g += field
            elif kind == 1:
                b += field * 0.7
                g += field * 0.35
            else:
                r += field * 0.15
                b += field * 0.4
                g += field * 0.2
        vig = soft_blob(yy, xx, H / 2, W / 2, 420, 1.0)
        frame = np.zeros((H, W, 3), np.uint8)
        frame[..., 0] = np.clip(r * 40 * vig, 0, 40).astype(np.uint8)
        frame[..., 1] = np.clip(g * 90 * vig, 0, 70).astype(np.uint8)
        frame[..., 2] = np.clip(b * 70 * vig + 4, 0, 55).astype(np.uint8)
        frames.append(frame)
    path = OUT / "ambient-void.mp4"
    iio.imwrite(path, np.stack(frames), fps=FPS, codec="libx264", quality=7)
    print("wrote", path, path.stat().st_size)


def make_forge():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rng = random.Random(21)
    particles = [
        (
            rng.uniform(0, W),
            rng.uniform(0, H),
            rng.uniform(0.4, 1.6),
            rng.uniform(8, 22),
            rng.uniform(0.5, 1.0),
        )
        for _ in range(80)
    ]
    frames = []
    for i in range(N):
        t = i / FPS
        frame = np.zeros((H, W, 3), np.float32)
        sweep = 0.5 + 0.5 * np.sin((xx / W) * math.pi * 2 + t * 0.6)
        frame[..., 1] += sweep * 12
        frame[..., 2] += sweep * 6
        for px, py, spd, size, bright in particles:
            x = (px + t * spd * 18) % W
            y = (py - t * spd * 28) % H
            field = soft_blob(yy, xx, y, x, size, bright)
            frame[..., 1] += field * 55
            frame[..., 2] += field * 28
            frame[..., 0] += field * 8
        bottom = np.exp(-(H - 1 - yy) / 90.0) * (0.4 + 0.2 * math.sin(t))
        frame[..., 1] += bottom * 35
        frame[..., 2] += bottom * 18
        frames.append(np.clip(frame, 0, 255).astype(np.uint8))
    path = OUT / "ambient-forge.mp4"
    iio.imwrite(path, np.stack(frames), fps=FPS, codec="libx264", quality=7)
    print("wrote", path, path.stat().st_size)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_void()
    make_forge()
    print("done")
