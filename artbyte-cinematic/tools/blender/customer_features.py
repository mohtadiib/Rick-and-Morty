import os
import numpy as np
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'renders', 'customer')
LOG = open(os.path.join(OUT, 'features_log.txt'), 'w')
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s); LOG.write(s + '\n'); LOG.flush()

img = bpy.data.images.load(os.path.join(ROOT, 'public', 'assets', 'style-reference', 'customer-turnaround.jpg'))
w, h = img.size
sheet = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3] * 255.0

Y0, Y1 = 565, 785
fc = sheet[Y0:Y1, 31:213]
sc = sheet[Y0:Y1, 435:634]
bc = sheet[Y0:Y1, 649:829]

# 1. Front centre line & chin bottom
R, G, B = fc[..., 0], fc[..., 1], fc[..., 2]
# On centre column x=90..96: find skin/hijab transitions
for x in (91, 93, 95):
    col = fc[:, x]
    # where cream ends (top of forehead): R-G < 40 and brightness > 175
    cream = (col[:, 0] > 180) & (col[:, 0] - col[:, 2] > 35) & (col[:, 0] - col[:, 1] < 48)
    skin = (col[:, 0] > col[:, 1] + 12) & (col[:, 0] < 200) & (col[:, 1] < 145)
    sy = np.where(skin)[0]
    log(f'front col x={x}: skin y={sy.min()}..{sy.max()}')

# Eye sclera & dark pupil/iris in front (y=80..115)
# Sclera is bright white-ish (R>180, G>175, B>170, R-B<25) inside face x=45..140
sclera = (fc[..., 0] > 165) & (fc[..., 1] > 160) & (fc[..., 2] > 155) & (np.abs(fc[..., 0] - fc[..., 2]) < 25)
sclera[:80] = False; sclera[115:] = False; sclera[:, :45] = False; sclera[:, 140:] = False
for side_name, x0, x1 in (('left_eye', 45, 92), ('right_eye', 94, 140)):
    ys, xs = np.where(sclera[:, x0:x1])
    log(f'{side_name} sclera: x={x0+xs.min()}..{x0+xs.max()}, y={ys.min()}..{ys.max()}')
    # dark iris/pupil inside eye box
    dark = (fc[80:115, x0:x1].max(2) < 85)
    dys, dxs = np.where(dark)
    if len(dys):
        log(f'{side_name} dark(iris/lash): x={x0+dxs.min()}..{x0+dxs.max()}, y={80+dys.min()}..{80+dys.max()}, cx={x0+dxs.mean():.1f}, cy={80+dys.mean():.1f}')

# Brows (y=65..84, dark)
brow = (fc[65:84, 45:140].max(2) < 95)
for side_name, x0, x1 in (('left_brow', 45, 92), ('right_brow', 94, 140)):
    bys, bxs = np.where(fc[65:84, x0:x1].max(2) < 95)
    if len(bys):
        log(f'{side_name}: x={x0+bxs.min()}..{x0+bxs.max()}, y={65+bys.min()}..{65+bys.max()}')

# Side profile landmarks
sR, sG, sB = sc[..., 0], sc[..., 1], sc[..., 2]
s_mx, s_mn = sc.max(2), sc.min(2)
s_bg = (s_mx - s_mn < 16) & (s_mx > 175) & (s_mx < 230)
s_fg = ~s_bg
for y in range(20, 175, 10):
    xs = np.where(s_fg[y])[0]
    if len(xs):
        log(f'side y={y:3d}: x={xs.min():3d}..{xs.max():3d}')
# Nose tip exact row
nose_xs = [(int(np.where(s_fg[y])[0].min()), y) for y in range(95, 130) if s_fg[y].any()]
nt_x, nt_y = min(nose_xs, key=lambda t: t[0])
log(f'side nose tip: x={nt_x}, y={nt_y}')

# Back head widths
b_mx, b_mn = bc.max(2), bc.min(2)
b_fg = ~((b_mx - b_mn < 16) & (b_mx > 175) & (b_mx < 230))
for y in range(20, 185, 15):
    xs = np.where(b_fg[y])[0]
    if len(xs):
        log(f'back y={y:3d}: x={xs.min():3d}..{xs.max():3d} (w={xs.max()-xs.min()})')
LOG.close()
