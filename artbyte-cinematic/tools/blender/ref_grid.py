"""Crop a region of a reference image, upscale it and draw a labelled pixel grid (headless Blender: bpy + numpy only).

  powershell -File tools/blender/run.ps1 tools/blender/ref_grid.py --img <abs path> --box x0,y0,x1,y1 --scale 3 --out <abs png> [--step 10]

Labels are source-image pixel coordinates (x along the top, y down the left), a thin line every `step` px and a bold one
every 5 steps. Used to read landmark coordinates for the BEARD_LINES / FACE_LINES style tracing.
"""
import sys, numpy as np, bpy

def arg(n, d=None):
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a[a.index(n) + 1] if n in a else d

FONT = {'0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
        '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111'}

def load(path):
    im = bpy.data.images.load(path); w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]           # top row first
    return a[..., :3]

def text(img, x, y, s, col, k=2):
    for i, ch in enumerate(s):
        g = FONT[ch]
        for r in range(5):
            for c in range(3):
                if g[r * 3 + c] == '1':
                    img[y + r * k:y + (r + 1) * k, x + (i * 4 + c) * k:x + (i * 4 + c + 1) * k] = col

def main():
    img = load(arg('--img')); x0, y0, x1, y1 = [int(v) for v in arg('--box').split(',')]; S = int(arg('--scale', 3)); step = int(arg('--step', 10))
    crop = img[y0:y1, x0:x1]; big = np.repeat(np.repeat(crop, S, 0), S, 1).copy()
    H, W = big.shape[:2]
    for gx in range((x0 + step - 1) // step * step, x1, step):
        major = (gx // step) % 5 == 0; u = (gx - x0) * S
        big[:, u] = big[:, u] * (0.35 if major else 0.75) + np.array([0, 0.9, 0.9]) * (0.65 if major else 0.25)
        if major: text(big, u + 2, 2, str(gx), np.array([1, 1, 0]))
    for gy in range((y0 + step - 1) // step * step, y1, step):
        major = (gy // step) % 5 == 0; v = (gy - y0) * S
        big[v, :] = big[v, :] * (0.35 if major else 0.75) + np.array([0.9, 0, 0.9]) * (0.65 if major else 0.25)
        if major: text(big, 2, v + 2, str(gy), np.array([1, 1, 0]))
    out = bpy.data.images.new('o', W, H); rgba = np.concatenate([big[::-1], np.ones((H, W, 1), np.float32)], 2)
    out.pixels = rgba.ravel(); out.filepath_raw = arg('--out'); out.file_format = 'PNG'; out.save()
    print('wrote', arg('--out'), W, H)

main()
