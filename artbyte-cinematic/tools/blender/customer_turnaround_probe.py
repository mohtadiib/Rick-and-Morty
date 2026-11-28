"""Probe customer-turnaround.jpg: find exact panel crops, draw coordinate grids, and extract
front / side / back hijab + face-opening boundary lines into renders/customer/.
"""
import os, json
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'renders', 'customer')
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'probe_log.txt'), 'w')
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s); LOG.write(s + '\n'); LOG.flush()


def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3] * 255.0
    return a


def save(arr, name):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([np.clip(arr[::-1], 0, 255) / 255.0, np.ones((h, w, 1))], 2).astype(np.float32)
    img.pixels = rgba.ravel().tolist()
    img.filepath_raw = os.path.join(OUT, name)
    img.file_format = 'PNG'
    img.save()


def draw_grid(arr, step=20, major=100):
    out = arr.copy()
    h, w, _ = out.shape
    for y in range(0, h, step):
        col = (255, 80, 80) if y % major == 0 else (180, 180, 180)
        alpha = 0.65 if y % major == 0 else 0.30
        out[y, :] = out[y, :] * (1 - alpha) + np.array(col) * alpha
    for x in range(0, w, step):
        col = (80, 160, 255) if x % major == 0 else (180, 180, 180)
        alpha = 0.65 if x % major == 0 else 0.30
        out[:, x] = out[:, x] * (1 - alpha) + np.array(col) * alpha
    return out


sheet_path = os.path.join(ROOT, 'public', 'assets', 'style-reference', 'customer-turnaround.jpg')
img = load(sheet_path)
H, W, _ = img.shape
log(f'Turnaround size: {W} x {H}')

# Find the 6 columns in the bottom row (head close-ups) by scanning horizontal non-bg density
R, G, B = img[..., 0], img[..., 1], img[..., 2]
mx, mn = img.max(2), img.min(2)
bg = (mx - mn < 18) & (mx > 185) & (mx < 225)
fg = ~bg

# Bottom row y-range: roughly 58% to 92% of H (above the pill labels)
y_bot0, y_bot1 = int(H * 0.58), int(H * 0.92)
col_density = fg[y_bot0:y_bot1].mean(0) > 0.05
# Find contiguous x-intervals for the 6 head panels
panels = []
in_p = False
x0 = 0
for x in range(W):
    if col_density[x] and not in_p:
        in_p = True; x0 = x
    elif not col_density[x] and in_p:
        in_p = False
        if x - x0 > 60:
            panels.append((x0, x))
if in_p and W - x0 > 60:
    panels.append((x0, W))

log('Detected bottom panels:', panels)

names = ['front_face', 'left_34', 'left_profile', 'back_head', 'right_profile', 'right_34']
summary = {'size': [W, H], 'panels': {}}

for idx, (px0, px1) in enumerate(panels):
    nm = names[idx] if idx < len(names) else f'panel_{idx}'
    # tighten y0, y1 for this panel (excluding pill label below)
    sub_fg = fg[int(H * 0.56):int(H * 0.91), px0:px1]
    ys = np.where(sub_fg.any(1))[0]
    py0 = int(H * 0.56) + int(ys.min())
    py1 = int(H * 0.56) + int(ys.max())
    # pad 20 px
    bx0, bx1 = max(0, px0 - 20), min(W, px1 + 20)
    by0, by1 = max(0, py0 - 20), min(H, py1 + 20)
    crop = img[by0:by1, bx0:bx1]

    # Segment hijab (cream) vs skin inside this panel
    cR, cG, cB = crop[..., 0], crop[..., 1], crop[..., 2]
    cmx, cmn = crop.max(2), crop.min(2)
    c_cream = (cR > 185) & (cG > 160) & (cR - cB > 35) & (cR - cG < 60)
    c_skin = (cR > cG + 10) & (cG > cB) & (cR - cB > 35) & ~c_cream & (cmx < 215)
    c_fg = ~( (cmx - cmn < 18) & (cmx > 185) & (cmx < 225) )

    # Measure top of hijab, bottom of chin/face skin, width of hijab and face
    hy = np.where(c_cream.any(1))[0]
    sy = np.where(c_skin.any(1))[0]
    hij_top = int(hy.min()) if len(hy) else -1
    skin_top = int(sy.min()) if len(sy) else -1
    skin_bot = int(sy.max()) if len(sy) else -1

    # Save grid-overlaid crop for visual inspection
    ov = draw_grid(crop, step=20, major=100)
    # Draw cyan contour on skin, red contour on hijab
    for mask, col in ((c_cream, (255, 50, 50)), (c_skin, (0, 230, 255))):
        p = np.pad(mask, 1)
        edge = mask & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
        ov[edge] = col

    if nm in ('front_face', 'left_profile', 'back_head', 'right_profile'):
        save(ov, f'turn_{nm}_grid.png')

    summary['panels'][nm] = {
        'box': [bx0, by0, bx1, by1],
        'hijab_top_local': hij_top,
        'skin_top_local': skin_top,
        'skin_bot_local': skin_bot,
    }
    log(f'{nm}: box={[bx0, by0, bx1, by1]} hij_top={hij_top} skin={skin_top}..{skin_bot}')

with open(os.path.join(OUT, 'turnaround_probe.json'), 'w') as f:
    json.dump(summary, f, indent=2)
LOG.close()
