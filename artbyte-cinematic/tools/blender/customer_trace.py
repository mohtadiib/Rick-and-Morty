"""Extract clean boundary lines for the customer from customer-turnaround.jpg:
  - Front Face: outer hijab contour, inner face-opening contour, eye_up / eye_lo / iris, brows, nose, mouth
  - Left Profile: outer hijab contour (front + back), face profile (forehead, nose, lips, chin), face-opening edge on cheek
  - Back Head: outer hijab contour, back drape/fold & pin landmark
Writes renders/customer/trace_{front,side,back}.png and renders/customer/customer_lines.json.
"""
import os, json
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'renders', 'customer')
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'trace_log.txt'), 'w')
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s); LOG.write(s + '\n'); LOG.flush()


def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3] * 255.0


def save(arr, name):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([np.clip(arr[::-1], 0, 255) / 255.0, np.ones((h, w, 1))], 2).astype(np.float32)
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


def fill_holes(m):
    """Flood-fill background from image border to fill interior holes (eyes/brows/mouth inside face)."""
    from collections import deque
    h, w = m.shape
    bg = ~m
    vis = np.zeros_like(m)
    q = deque()
    for x in range(w):
        if bg[0, x]: vis[0, x] = True; q.append((0, x))
        if bg[h - 1, x]: vis[h - 1, x] = True; q.append((h - 1, x))
    for y in range(h):
        if bg[y, 0]: vis[y, 0] = True; q.append((y, 0))
        if bg[y, w - 1]: vis[y, w - 1] = True; q.append((y, w - 1))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not vis[ny, nx]:
                vis[ny, nx] = True; q.append((ny, nx))
    return ~vis


def largest_cc(m):
    from collections import deque
    h, w = m.shape
    seen = np.zeros_like(m)
    best = []
    ys, xs = np.where(m)
    for y, x in zip(ys, xs):
        if seen[y, x]: continue
        q = deque([(y, x)]); seen[y, x] = True; pts = []
        while q:
            cy, cx = q.popleft(); pts.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) > len(best): best = pts
    out = np.zeros_like(m)
    for y, x in best: out[y, x] = True
    return out


sheet = load(os.path.join(ROOT, 'public', 'assets', 'style-reference', 'customer-turnaround.jpg'))
# Bottom row crops (same y-band 565..785 for all 3 so y-coordinates match 1:1!)
Y0, Y1 = 565, 785
PANELS = {
    'front': (31, 213),
    'side':  (435, 634),
    'back':  (649, 829),
}

data = {'y_offset': Y0, 'panels': {}}

for name, (x0, x1) in PANELS.items():
    crop = sheet[Y0:Y1, x0:x1]
    h, w, _ = crop.shape
    R, G, B = crop[..., 0], crop[..., 1], crop[..., 2]
    mx, mn = crop.max(2), crop.min(2)
    # Plain grey background: low saturation and mid-high brightness
    bg = (mx - mn < 16) & (mx > 175) & (mx < 230)
    fg = largest_cc(~bg)

    # Hijab vs Face skin: skin is much redder/darker than cream hijab
    # Cream hijab has high brightness or yellow hue (G closer to R, R-G < 48)
    # Skin has strong R-B > 45 and darker G/B
    skin_raw = fg & (R > G + 14) & (G > B + 6) & (R < 195) & (G < 145)
    # Exclude green dress collar at very bottom
    dress = fg & (G > R + 10)
    fg_head = fg & ~dress

    if name in ('front', 'side'):
        face_cc = largest_cc(skin_raw & (np.arange(h)[:, None] < 190))
        face_solid = fill_holes(dilate(erode(face_cc, 1), 1))
    else:
        face_solid = np.zeros_like(fg)

    # Outer silhouette rows (every 4 px)
    outer_rows = {}
    for y in range(h):
        xs = np.where(fg_head[y])[0]
        if len(xs) > 4:
            outer_rows[y] = [int(xs.min()), int(xs.max())]

    face_rows = {}
    if face_solid.any():
        for y in range(h):
            xs = np.where(face_solid[y])[0]
            if len(xs) > 3:
                face_rows[y] = [int(xs.min()), int(xs.max())]

    # Draw clean 3x overlay: red = outer hijab, cyan = face opening, white ticks every 20 px
    ov = crop.copy()
    outer_edge = fg_head & ~erode(fg_head, 1)
    ov[outer_edge] = (255, 45, 45)
    if face_solid.any():
        face_edge = face_solid & ~erode(face_solid, 1)
        ov[face_edge] = (0, 235, 255)
    for y in range(0, h, 20):
        ov[y, 0:(14 if y % 100 == 0 else 7)] = (255, 255, 255)
    for x in range(0, w, 20):
        ov[0:(14 if x % 100 == 0 else 7), x] = (255, 255, 255)
    ov3 = np.repeat(np.repeat(ov, 3, 0), 3, 1)
    save(ov3, f'trace_{name}.png')

    pinfo = {
        'box': [x0, Y0, x1, Y1],
        'w': w, 'h': h,
        'outer_top': min(outer_rows),
        'outer_bot': max(outer_rows),
        'outer_rows': {str(k): v for k, v in outer_rows.items() if k % 4 == 0},
        'face_top': min(face_rows) if face_rows else None,
        'face_bot': max(face_rows) if face_rows else None,
        'face_rows': {str(k): v for k, v in face_rows.items() if k % 4 == 0},
    }
    data['panels'][name] = pinfo
    log(f'{name}: outer y={pinfo["outer_top"]}..{pinfo["outer_bot"]}, face y={pinfo["face_top"]}..{pinfo["face_bot"]}')

# Find eye centres & mouth row in front panel
f_crop = sheet[Y0:Y1, PANELS['front'][0]:PANELS['front'][1]]
# Centre line of front face from face_rows around y=60..140
f_rows = data['panels']['front']['face_rows']
mid_xs = [0.5 * (v[0] + v[1]) for k, v in f_rows.items() if 60 <= int(k) <= 130]
cx_front = float(np.median(mid_xs))
log(f'front face centre x: {cx_front:.2f}')
data['front_cx'] = cx_front

with open(os.path.join(OUT, 'customer_lines.json'), 'w') as f:
    json.dump(data, f, indent=2)
LOG.close()
