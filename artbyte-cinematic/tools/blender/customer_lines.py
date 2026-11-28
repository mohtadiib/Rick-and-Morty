"""Customer reference measurement: draws the boundary lines of the customer on the reference image.

Headless Blender (bpy + numpy only), the same idea as `pharmacist_head.py --measure`:
  powershell -File tools/blender/run.ps1 tools/blender/customer_lines.py [--ref <img>] [--out <dir>] [--tag front]

It segments the reference by colour (background, hijab, skin, dress, dark) and writes
  <out>/customer-lines-<tag>-full.png   whole figure with the silhouette lines (hijab, face opening, dress, skin)
  <out>/customer-lines-<tag>-head.png   2x head crop with the face-opening outline, eye / brow / nose / mouth rows
  <out>/customer-lines-<tag>.json       the same lines as numbers (px of the reference, y down) + landmarks
These lines are the target the customer head and hijab are built to (see AGENTS.md section 2.1).
"""
import sys, os, json
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default


REF = arg('--ref', os.path.join(ROOT, 'public', 'assets', 'style-reference', 'customer-reference.jpg'))
OUT = arg('--out', os.path.join(ROOT, 'renders', 'customer'))
TAG = arg('--tag', 'front')
os.makedirs(OUT, exist_ok=True)


def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]  # y down
    return a * 255.0


def save(arr, name):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([arr[::-1] / 255.0, np.ones((h, w, 1))], 2).astype(np.float32)
    img.pixels = rgba.ravel().tolist()
    img.filepath_raw = os.path.join(OUT, name)
    img.file_format = 'PNG'
    img.save()


def erode(m, n=1):
    for _ in range(n):
        p = np.pad(m, 1)
        m = m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m


def dilate(m, n=1):
    for _ in range(n):
        p = np.pad(m, 1)
        m = m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return m


def outline(m, t=1):
    return dilate(m, t) & ~erode(m, t)


def clean(m, n=2):
    return dilate(erode(m, n), n)  # opening: removes speckle


def largest_blob_rows(m, y0, y1):
    return m


img = load(REF)
H, W, _ = img.shape
R, G, B = img[..., 0], img[..., 1], img[..., 2]
mx = img.max(2); mn = img.min(2)

bg = (mx - mn < 22) & (mx > 120)
cream = (R > 190) & (G > 165) & (R - B > 45) & (R - G < 55)
skin = (R > G + 10) & (G > B) & (R - B > 38) & ~cream & (mx < 215)
dress = (G > R + 18) & (G > 60)
dark = (mx < 70)
fig = ~bg

# ---------------------------------------------------------------- the face opening in the hijab
Y0, Y1 = 150, 520
head_skin = clean(skin, 2)
head_skin[:Y0] = False; head_skin[Y1:] = False
rows = {}
for y in range(Y0, 440):
    xs = np.where(head_skin[y, 500:1000])[0]
    if len(xs) > 10:
        rows[y] = (int(xs.min()) + 500, int(xs.max()) + 500)
face_top = min(rows)
face_bot = max(y for y in rows if rows[y][1] - rows[y][0] > 20)

# hijab silhouette over the head+shoulders and the whole figure
hij = clean(cream, 2)
hy = np.where(hij[:, :].any(1))[0]
hij_rows = {}
for y in range(int(hy.min()), int(hy.max()) + 1, 2):
    xs = np.where(hij[y])[0]
    if len(xs): hij_rows[y] = (int(xs.min()), int(xs.max()))

# figure silhouette: height, per-row extents (every 10 px)
fy = np.where(fig[:, :].any(1))[0]
top, bot = int(fy.min()), int(fy.max())
sil = {}
for y in range(top, bot, 10):
    xs = np.where(clean(fig[y:y + 1], 0)[0])[0]
    if len(xs): sil[y] = (int(xs.min()), int(xs.max()))

# ---------------------------------------------------------------- landmarks inside the face opening
# eyes: dark iris/lash pixels + white of the eye inside the face region
fx0 = min(v[0] for v in rows.values()); fx1 = max(v[1] for v in rows.values())
face_mask = np.zeros_like(skin)
for y, (a, b) in rows.items(): face_mask[y, a:b + 1] = True
inner = erode(face_mask, 6)
holes = inner & ~skin  # eyes, brows, lips, nostrils are not "skin colour" inside the face


def blobs(m):
    """connected components (4-neighbour), returns list of (area, x0, y0, x1, y1)"""
    from collections import deque
    seen = np.zeros_like(m); out = []
    ys, xs = np.where(m)
    for y, x in zip(ys, xs):
        if seen[y, x]: continue
        q = deque([(y, x)]); seen[y, x] = True; pts = []
        while q:
            cy, cx = q.popleft(); pts.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) > 40:
            py = [p[0] for p in pts]; px = [p[1] for p in pts]
            out.append((len(pts), min(px), min(py), max(px), max(py)))
    return out


bl = sorted(blobs(holes), reverse=True)[:12]
log = {'ref': os.path.basename(REF), 'size': [W, H], 'figure_top': top, 'figure_bottom': bot,
       'face_opening_rows': {str(k): v for k, v in rows.items() if k % 4 == 0},
       'hijab_rows': {str(k): v for k, v in hij_rows.items() if k % 8 == 0},
       'silhouette': {str(k): v for k, v in sil.items()},
       'face_top': face_top, 'face_bottom': face_bot, 'blobs_in_face': [list(map(int, b)) for b in bl]}
with open(os.path.join(OUT, f'customer-lines-{TAG}.json'), 'w') as f:
    json.dump(log, f)
print('figure', top, bot, 'face', face_top, face_bot, 'blobs', bl[:8])

# ---------------------------------------------------------------- overlays
RED, CYAN, YEL, GRN, MAG = (255, 40, 40), (0, 230, 255), (255, 230, 0), (60, 255, 80), (255, 60, 255)


def paint(canvas, mask, col):
    canvas[mask] = col


ov = img.copy()
paint(ov, outline(hij, 2), RED)           # hijab silhouette
paint(ov, outline(head_skin, 2), CYAN)    # face opening
paint(ov, outline(clean(dress, 2), 2), GRN)  # dress
paint(ov, outline(clean(skin, 2) & (np.arange(H)[:, None] > 900), 2), YEL)  # hands / feet skin
save(ov, f'customer-lines-{TAG}-full.png')

# head crop 2x with landmark guide rows
cx0, cx1, cy0, cy1 = 720, 1070, 140, 600
crop = ov[cy0:cy1, cx0:cx1].copy()
for b in bl:
    _, x0, y0, x1, y1 = b
    ys = slice(max(y0 - cy0, 0), max(y1 - cy0, 0) + 1)
    crop[max(y0 - cy0, 0), max(x0 - cx0, 0):max(x1 - cx0, 0) + 1] = MAG
    crop[max(y1 - cy0, 0), max(x0 - cx0, 0):max(x1 - cx0, 0) + 1] = MAG
    crop[ys, max(x0 - cx0, 0)] = MAG
    crop[ys, max(x1 - cx0, 0)] = MAG
for y in range(cy0, cy1, 20):  # 20 px ruler on the left edge (long tick every 100)
    crop[y - cy0, 0:(30 if y % 100 == 0 else 12)] = (255, 255, 255)
crop = np.repeat(np.repeat(crop, 2, 0), 2, 1)
save(crop, f'customer-lines-{TAG}-head.png')
print('wrote overlays to', OUT)
