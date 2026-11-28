"""
Pharmacist head, authored in Blender (headless):

    blender -b --factory-startup --python tools/blender/pharmacist_head.py -- [--render] [--ref <crop.png>] [--out <dir>] [--cuts N]
        [--turnaround <sheet.webp>] [--beard-lines <sheet.webp>]      (sheet = absolute path of pharmacist-turnaround.webp)

Frame: the model is authored in the three.js head frame (x right, y up, z forward, metres, origin at the
skull centre, headScale already baked in) and converted to Blender axes (x, -z, y) when meshes are made, so
the glTF export (+Y up) comes back out in the same frame the rig uses.

Parts: skin (eye apertures carved by the eyeballs, lids = skin draped over the sphere), eyes, ears, brows,
hair and beard shells, acetate glasses. Landmarks come from public/assets/style-reference/pharmacist-reference.jpg
(400x420 px crop of the face, 2x: 1 crop px = PX metres, eye line = y +0.014).
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = arg('--out', os.path.join(ROOT, 'renders', 'blender'))
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'log.txt'), 'w')
def log(*a):
    LOG.write(' '.join(str(x) for x in a) + '\n'); LOG.flush()

# --------------------------------------------------------------------------- parameters
HS = 1.1125                               # headScale, baked into the mesh (the rig then uses headScale 1)
PX = 0.000408                             # metres per pixel of the reference crop
def rx_(px): return (px - 392) * PX       # reference crop px → head frame
def ry_(py): return 0.014 + (378 - py) * PX
F = dict(                                  # face sculpt (design space, pre-scale) – matched to pharmacist-turnaround.webp
    rx=0.0802, ry=0.115, rz=0.1, eyeX=0.0325, eyeY=0.0128, jawNarrow=0.11, browRidge=0.0020, socket=0.0068,
    cheek=0.0040, jawAngle=0.0020, noseBridge=0.0072, noseDorsum=0.0108, noseTip=0.0128, noseW=1.26, alae=0.0100, muzzle=0.0135,
    # lipW / mouthY: the sheet's mouth, corner to corner 196 px (smile 0.55) and its slit at v 541..552 (BEARD_LINES frame)
    chin=0.025, chinDrop=0.0085, lipW=0.0330, noseY=0.0062, lowC=0.95, crown=0.0055, socketW=1.12, socketX=1.0,
    socketIn=0.0, lowW=(0.13, 0.02), cheekFull=0.0018, mouthY=-0.0510, chinW=1.50, crownW=0.14, temple=0.0032,
    frontZ=0.052, backZ=(0.43, 0.68), foreheadZ=0.022,
)
# shape vs the reference (front + turnaround silhouette): compact rounded jaw, smooth Pixar nose,
# warm hooded eyes with larger iris, close-cropped faded hair and beard.
# eyeball (metres, final scale); the lid opening follows FACE_LINES (eye_up / eye_lo). dy lifts the eyeball centre onto the
# sheet's iris centre (v 372.5), so the iris rests on the lower lid and the upper lid covers its top as in the reference
EYE = dict(R=0.0210, protrude=0.0052, dy=0.0018, lidT=0.0018, clear=0.0009)
# hairline (azimuth from the front → design height). Fuller top hair cap, soft faded temples down to the sideburn,
# clean ear root clearance, and a higher level tapered nape across the back (turnaround sheet).
HAIRLINE = [(0, 0.0875), (0.4, 0.0870), (0.62, 0.0855), (0.78, 0.0830), (0.86, 0.0770), (0.93, 0.0660), (1.00, 0.0490), (1.08, 0.0320),
            (1.18, 0.0200), (1.30, 0.0220), (1.45, 0.0260), (1.62, 0.0200), (1.85, -0.0060), (2.15, -0.0250), (2.48, -0.0330), (math.pi, -0.0350)]
# Facial-hair reference lines, traced on pharmacist-turnaround.webp after mapping its Front Face and Left Profile panels into
# the model's own orthographic front / side renders the way measure_turnaround() maps them (crown + eye datum, side panel
# aligned on the nose tip): 1 px = PX metres; v → y = ry_(v); front u → x = (u - 392) PX; side u → z = (400 - u) PX.
# Front lines are (d, v) with d = px from the face's centre line, used on both sides. The sheet smiles, so the masks are
# evaluated on the skin as it sits at smile = REF_SMILE. `--beard-lines` draws these lines over the model (beard_lines_check).
REF_SMILE = 0.55
BEARD_LINES = dict(
    # moustache: top edge under the nose out to the corner, then the corner's outer edge down to where it meets the cheek beard
    mst=[(0, 490.5), (36, 490.5), (46, 491), (56, 492.5), (66, 496), (76, 500), (86, 504), (96, 508), (104, 511.5), (110, 514),
         (111, 524), (111, 532)],
    # shaved skin under the lower lip: from the mouth corner down the outer edge of the lobe, round its bottom, up the stem of
    # the soul patch, under and over the patch's top bar to the centre line (above it the opening follows the lips)
    shave=[(97, 538), (95, 556), (91, 572), (86, 586), (80, 596), (72, 607), (62, 616), (52, 621), (42, 622), (32, 618), (24, 610),
           (17, 602), (17, 596), (25, 594), (33, 592), (35, 588), (33, 583), (20, 581), (0, 580)],
    # side: sideburn front edge from the glasses arm down, then the cheek line diagonally forward to the moustache corner. The
    # sheet's cheek edge is a stubble fade: the line runs where the beard turns dense (about half the skin's brightness), which
    # also lands on the front panel's cheek line (chk_cheek_*) on this head; the faint outer edge is chk_cheek_side, and the
    # band between them is painted as stubble (skin_detail)
    cheek=[(258, 362), (257, 400), (255, 430), (252, 452), (247, 472), (240, 492), (230, 502), (220, 510), (210, 516), (200, 522),
           (190, 527), (180, 531), (170, 534), (160, 538), (150, 541), (140, 544)],
    # side: where the beard meets the neck, from under the chin back to below the ear, then the back edge up to the sideburn top
    neck=[(95, 660), (110, 673), (130, 678), (150, 674), (170, 666), (190, 659), (210, 650), (225, 640), (240, 630), (255, 620),
          (268, 610), (280, 600), (290, 590), (297, 580), (300, 570), (300, 550), (298, 520), (292, 480), (292, 440), (296, 400), (300, 362)],
    # checks only (drawn and measured, not used by the masks): moustache bottom = upper lip top, the cheek line as seen from the
    # front on the sheet's left and right side, the faint outer edge of the cheek stubble and the moustache's top in profile
    chk_lip=[(0, 514), (40, 515), (70, 517), (90, 520), (98, 522)],
    chk_cheek_l=[(176, 470), (166, 495), (156, 507), (146, 515), (136, 522), (126, 527), (116, 535)],
    chk_cheek_r=[(164, 465), (154, 490), (144, 505), (134, 515), (124, 525), (114, 532)],
    chk_cheek_side=[(251, 450), (243, 468), (230, 486), (210, 500), (190, 511), (170, 521), (150, 531)],
    chk_mst_side=[(70, 498), (90, 497), (110, 498), (120, 500), (130, 505), (140, 512)],
)
# Eyes, glasses and mouth: reference lines traced on the same mapped Front Face panel (front frame rows v, at the sheet's smile).
# d = px from the face's own centre line: the midpoint of the two eyes and of the two lenses (u 396.5 in the mapped panel, which
# sits 4.5 px right of the head outline's centre; the mouth's midpoint is u 397). On the model the centre line is u 392.
# `--face-lines` draws them over the model and logs the distance of the model's edges to each line (face_lines_check).
FACE_LINES = dict(
    # eye opening from the inner to the outer corner: upper lid margin (lower edge of the lash line) and lower lid margin
    eye_up=[(49.2, 381.6), (55, 374), (61, 367), (76, 361), (91.5, 360.5), (106.5, 361), (121.5, 372), (130.8, 381.6)],
    eye_lo=[(49.2, 381.6), (55, 385), (61, 389.5), (76, 391.5), (91.5, 392), (106.5, 392), (121.5, 386), (130.8, 381.6)],
    iris=(85.5, 372.5, 20.5),        # iris centre (d, v), radius (px): it rests on the lower lid, the upper lid covers its top
    # glasses: the rim's centre line, a superellipse fitted to the dark ring (centre d, v, half-width a, half-height b, exponent
    # n), the bridge bar's centre line and the hinge row (where the arm leaves the rim, as in the profile)
    rim=(90.65, 386.2, 65.0, 57.05, 2.23),
    bridge=[(0, 356), (25, 356)],
    # mouth (d from u 397): where the teeth show the lips part between open_top (upper lip edge) and open_bot (lower lip edge);
    # outside that the lips meet on a dark crease that turns up into the corners under the moustache
    open_top=[(0, 541.5), (17, 541.5), (32, 540.5), (42, 543)],
    open_bot=[(0, 554), (17, 552.5), (32, 549.5), (42, 546)],
    crease=[(42, 544.5), (52, 540), (67, 534), (82, 526), (87, 523)],
    # the lower lip's bottom edge (where its colour gives way to the skin), rising into the corner crease
    lip_lo=[(0, 576), (17, 573), (32, 568), (42, 563), (52, 557), (60, 550), (70, 533)],
    # the jaw: the beard's outer edge from the mouth line down to the bottom of the chin (d from u 396.5)
    jaw=[(165, 540), (163.5, 548), (162, 556), (159, 564), (155.5, 572), (152.5, 580), (149.5, 588), (145, 596), (138.5, 604),
         (132.5, 612), (125, 620), (117.5, 628), (110.5, 636), (102.5, 644), (93, 652), (85, 660), (75, 668), (66.5, 676),
         (52.5, 684), (32.5, 692), (0, 700)],
)
FACE_LINES_SIDE = dict(arm=[(125, 353), (330, 353)])      # profile (side frame u, v): the glasses arm, level from hinge to ear
# Graded fade (the sheet's haircut): the hair thins from dense to skin over a 15-20 mm band at the nape and behind the ears,
# and the temples and sideburns are faded. Measured on the Left Profile and Back Head panels (mapped like BEARD_LINES and
# box-blurred over the curls): `dense` = where the darkness is 80 % of the hair's, `skin` = 20 %. Side lines (u, v) in the side
# frame, back lines (d, v) with d = px from the back view's centre line. temple / sideburn: density (0 skin .. 1 dense) by height
# (mm) in front of the ear, the sideburn's relative to the beard. Below the dense hair the skin is painted with a stubble
# gradient (skin_detail); the hair and beard shells end where the density reaches about 0.8-0.9 and thin out above that.
HAIR_FADE = dict(
    side_dense=[(415, 480), (425, 490), (435, 495), (450, 497), (465, 504)],
    side_skin=[(415, 507), (425, 520), (435, 527), (450, 532), (465, 532)],
    back_dense=[(0, 521), (22.5, 519.5), (37.5, 515.5), (52.5, 511), (67.5, 510.5), (82.5, 508.5), (97.5, 509.5), (112.5, 502.5),
                (127.5, 495), (142.5, 483)],
    back_skin=[(0, 550), (22.5, 548), (37.5, 546.5), (52.5, 546), (67.5, 544), (82.5, 542.5), (97.5, 541.5), (112.5, 532),
               (127.5, 525.5), (142.5, 506)],
    temple=[(14.0, 0.0), (17.0, 0.60), (30.0, 0.68), (36.0, 0.72), (42.0, 0.80), (50.0, 0.85), (58.0, 0.90), (66.0, 1.0)],
    sideburn=[(-26.0, 1.0), (-19.5, 0.82), (-13.0, 0.62), (-7.0, 0.42), (0.0, 0.30), (9.0, 0.34), (15.0, 0.55), (21.0, 0.66)],
)
CUBE_CUTS = int(arg("--cuts", 110))       # quads per cube-sphere edge

def sstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0.0, 1.0); return t * t * (3 - 2 * t)
def mix(a, b, t): return a + (b - a) * t
def gs(P, c, r):
    d = (P - np.array(c)) / np.array(r); return np.exp(-(d * d).sum(-1))
def prof(rows, k): return np.interp(k, [r[0] for r in rows], [r[1] for r in rows])

def prof_smooth(rows, k):
    """Monotone PCHIP cubic Hermite interpolation through control knots (eliminates C0 crease bands)."""
    xs = np.array([r[0] for r in rows], dtype=float)
    ys = np.array([r[1] for r in rows], dtype=float)
    n = len(xs)
    if n < 3:
        return np.interp(k, xs, ys)
    h = np.diff(xs)
    delta = np.diff(ys) / h
    d = np.zeros(n, dtype=float)
    d[0], d[-1] = delta[0], delta[-1]
    for i in range(1, n - 1):
        if delta[i - 1] * delta[i] > 0.0:
            w1 = 2.0 * h[i] + h[i - 1]
            w2 = h[i] + 2.0 * h[i - 1]
            d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    kv = np.asarray(k, dtype=float)
    idx = np.clip(np.searchsorted(xs, kv, side='right') - 1, 0, n - 2)
    hi = h[idx]
    t = np.clip((kv - xs[idx]) / hi, 0.0, 1.0)
    t2 = t * t
    t3 = t2 * t
    h00 = 2.0 * t3 - 3.0 * t2 + 1.0
    h10 = t3 - 2.0 * t2 + t
    h01 = -2.0 * t3 + 3.0 * t2
    h11 = t3 - t2
    return h00 * ys[idx] + h10 * hi * d[idx] + h01 * ys[idx + 1] + h11 * hi * d[idx + 1]

def poly_sd(px, py, poly):
    """Signed distance of the points (px, py) to the closed polygon [(x, y), ...]: + inside, - outside (same units)."""
    Q = np.asarray(poly, dtype=float); d2 = np.full(px.shape, np.inf); inside = np.zeros(px.shape, bool)
    for i in range(len(Q)):
        (ax, ay), (bx, by) = Q[i], Q[(i + 1) % len(Q)]
        ex, ey = bx - ax, by - ay
        t = np.clip(((px - ax) * ex + (py - ay) * ey) / max(ex * ex + ey * ey, 1e-18), 0.0, 1.0)
        d2 = np.minimum(d2, (px - ax - t * ex) ** 2 + (py - ay - t * ey) ** 2)
        if ey != 0: inside ^= ((ay > py) != (by > py)) & (px < ax + (py - ay) * ex / ey)
    d = np.sqrt(d2); return np.where(inside, d, -d)

EDGE = 0.0016                                  # width of a hair / beard edge ramp (metres)
def grow(sd, w=EDGE): return sstep(-0.1 * w, 0.9 * w, sd)          # region adds hair: ~0.03 on the line, so the shell surfaces there
def carve(sd, w=EDGE): return 1 - sstep(-0.9 * w, 0.1 * w, sd)     # region removes hair: ~0.03 left on the line
def front_pts(half): return [(d * PX, ry_(v)) for d, v in half]       # front (d, v) px → (|x|, y) metres
def side_pts(pts): return [((400 - u) * PX, ry_(v)) for u, v in pts]   # side (u, v) px → (z, y) metres
def mirror(half):
    """Points on one side of the centre line, from the top of the line round to its bottom → closed polygon over both sides."""
    return list(half) + [(-x, y) for x, y in half[::-1]]

# --------------------------------------------------------------------------- skull sculpt (port of HeroHead.sculpt + warpFace)
def sculpt(P, F):
    x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2].copy()
    k = sstep(0, -0.1, z); back = z < 0
    z = np.where(back, z * (1 + 0.015 * k), z); y = np.where(back, y + 0.003 * k * sstep(-0.02, 0.08, y), y)
    low = sstep(-0.015, -0.112, y)
    x = x * (1 - F['jawNarrow'] * low * (0.4 + 0.6 * sstep(-0.03, 0.085, z)))
    if F.get('lowW'):
        zf = mix(sstep(-0.03, 0.012, z), sstep(-0.075, -0.045, z), sstep(-0.026, -0.044, y))
        x = x * (1 - (F['lowW'][0] * sstep(-0.012, -0.05, y) + F['lowW'][1] * sstep(-0.065, -0.105, y)) * zf)
    y = y - 0.06 * np.maximum(0.0, y - 0.05) * sstep(0.035, 0.065, y)
    if F.get('crown'): y = y + F['crown'] * sstep(0.015, 0.1, y)
    # smooth upper-back dome (12-to-2 o'clock) and 11-o'clock crown fullness onto the reference curve
    y = y - 0.0048 * sstep(0.035, 0.112, y) * sstep(0.025, -0.055, z)
    y = y + 0.0026 * gs(np.stack([x, y, z], 1), (0.0, 0.098, 0.052), (0.065, 0.024, 0.032))
    if F.get('crownW'): x = x * (1 + F['crownW'] * sstep(0.05, 0.100, y))   # broader, rounder dome across top sides (Front + Back)
    z = np.where(z > 0, z * (1 - 0.07 * sstep(0.035, 0.07, np.abs(x)) * sstep(-0.1, 0.0, y)), z)
    # compact ~30-degree rising jawline from the front chin up toward the jaw angle under the ear (exact reference height)
    jaw = mix(-0.048, -0.103, sstep(-0.012, 0.082, z)); kk = sstep(0.086, -0.012, z); m = y < jaw
    y = np.where(m, jaw + (y - jaw) * (1 - 0.78 * kk), y); x = np.where(m, x * (1 - 0.24 * kk * sstep(jaw, jaw - 0.028, y)), x)
    P = np.stack([x, y, z], 1)
    EX, EY, nw, MY = F['eyeX'], F['eyeY'], F['noseW'], F['mouthY']
    def add(ax, amt): P[:, ax] += amt
    add(2, F['browRidge'] * gs(P, (0, 0.034, 0.092), (0.05, 0.011, 0.04)))
    for s in (1, -1):
        add(2, -F['socket'] * gs(P, (s * (EX - F['socketIn']), EY - 0.001, 0.092), (0.0175 * F['socketW'] * F['socketX'], 0.0128 * F['socketW'], 0.04)))
        add(2, F['cheek'] * gs(P, (s * 0.055, -0.004, 0.07), (0.016, 0.012, 0.04)))
        add(0, s * 0.0035 * gs(P, (s * 0.06, -0.006, 0.06), (0.016, 0.014, 0.03)))
        add(0, -s * F.get('temple', 0.0035) * gs(P, (s * 0.07, 0.04, 0.035), (0.014, 0.02, 0.03)))   # temple hollow
        add(0, s * F['jawAngle'] * gs(P, (s * 0.058, -0.072, -0.004), (0.012, 0.016, 0.03)))
        ala = gs(P, (s * 0.0142 * nw, -0.0315 + F['noseY'], 0.092), (0.0105 * nw, 0.0092, 0.04))
        add(2, F['alae'] * ala); add(0, s * F['alae'] * 0.52 * ala)
        add(2, -0.0026 * gs(P, (s * 0.0074 * nw, -0.040 + F['noseY'], 0.105), (0.0038, 0.0026, 0.02)))
        add(2, -0.0018 * gs(P, (s * (F['lipW'] + 0.0045), MY - 0.0002, 0.09), (0.005, 0.006, 0.03)))
    add(2, F['noseBridge'] * gs(P, (0, 0.012, 0.09), (0.0085 * nw, 0.022, 0.04)))
    add(2, F['noseDorsum'] * gs(P, (0, -0.016 + F['noseY'] * 0.6, 0.092), (0.0115 * nw, 0.022, 0.04)))
    # soft rounded Pixar nose bulb (wider & fuller vertically than a sharp tip)
    add(2, F['noseTip'] * gs(P, (0, -0.0285 + F['noseY'], 0.10), (0.0145 * nw, 0.0135, 0.042)))
    add(1, -0.0016 * gs(P, (0, -0.033 + F['noseY'], 0.108), (0.012, 0.007, 0.022)))
    lw = max(1, F['lipW'] / 0.0212)
    add(2, F['muzzle'] * gs(P, (0, MY - 0.0002, 0.085), (0.028 * lw, 0.022, 0.04)))
    add(2, -0.0012 * gs(P, (0, MY + 0.0128, 0.1), (0.0035, 0.006, 0.02)))
    add(2, -0.0022 * gs(P, (0, MY, 0.1), (0.022 * lw, 0.0058, 0.02)))
    add(2, F['chin'] * gs(P, (0, -0.090, 0.084), (0.024 * F['chinW'], 0.022, 0.048)))
    # smooth lower-face/jaw forward alignment so the lower lip and compact chin sit beneath the upper lip (turnaround profile)
    add(2, 0.0150 * sstep(-0.038, -0.092, P[:, 1]) * sstep(0.015, 0.075, P[:, 2]))
    if F.get('cheekFull'):
        for s in (1, -1):
            add(0, s * F['cheekFull'] * gs(P, (s * 0.06, -0.035, 0.045), (0.02, 0.026, 0.035)))
            add(2, F['cheekFull'] * 0.6 * gs(P, (s * 0.045, -0.03, 0.07), (0.02, 0.022, 0.03)))
    # gentle rounded front chin contour (stays compact above the neck)
    add(1, -F['chinDrop'] * gs(P, (0, -0.092, 0.084), (0.032, 0.018, 0.038)))
    # profile (turnaround sheet, --side): balanced front depth, sleeker occiput curving smoothly into neck
    if F.get('frontZ'):
        P[:, 2] = np.where(P[:, 2] > 0, P[:, 2] * (1 + F['frontZ'] * sstep(-0.01, 0.03, P[:, 2])), P[:, 2])
    if F.get('backZ'):
        k = mix(F['backZ'][0], F['backZ'][1], sstep(0.06, -0.055, P[:, 1])) * sstep(0.02, -0.02, P[:, 2])
        P[:, 2] = np.where(P[:, 2] < 0, P[:, 2] * (1 - k), P[:, 2])
    # curve the lower occiput gently forward into the neck so there is no flat overhanging shelf at the back
    add(2, 0.014 * sstep(-0.032, -0.072, P[:, 1]) * sstep(0.005, -0.045, P[:, 2]))
    if F.get('foreheadZ'): add(2, F['foreheadZ'] * sstep(0.020, 0.080, P[:, 1]) * sstep(-0.02, 0.05, P[:, 2]))
    return P

def warp_face(P, F):
    P = P.copy(); d = F['eyeY'] - P[:, 1]; m = d > 0
    P[:, 1] = np.where(m, F['eyeY'] - d * (1 - F['lowC'] * d * sstep(-0.045, 0.03, P[:, 2])), P[:, 1])
    return P

def lock_profiles(P):
    """Direct millimeter profile lock (in final head-frame metres) matching the cyan model contours
    to the red turnaround reference contours across Side (front, under-chin, back) and Front/Back width."""
    P = P.copy()
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)

    # 1. Side Front Profile correction dz_front(y): forehead, nose bridge, under-nose tuck, moustache, mentolabial crease, lower chin tip
    dz_f_rows = [
        (-0.115,  0.0080), (-0.108,  0.0078), (-0.104,  0.0052), (-0.100,  0.0038),
        (-0.096,  0.0010), (-0.092, -0.0006), (-0.088, -0.0022), (-0.084, -0.0040),
        (-0.080, -0.0048), (-0.076, -0.0060), (-0.072, -0.0045), (-0.068, -0.0005),
        (-0.064,  0.0014), (-0.058,  0.0020), (-0.052,  0.0010), (-0.048,  0.0048),
        (-0.044,  0.0058), (-0.040,  0.0006), (-0.036, -0.0044), (-0.032, -0.0044),
        (-0.028,  0.0000), (-0.024,  0.0004), (-0.016,  0.0024), (-0.008,  0.0044),
        ( 0.000,  0.0033), ( 0.008,  0.0024), ( 0.020,  0.0022), ( 0.036,  0.0042),
        ( 0.040,  0.0062), ( 0.048,  0.0052), ( 0.056,  0.0033), ( 0.068,  0.0004),
        ( 0.080, -0.0006), ( 0.088, -0.0014), ( 0.096,  0.0015), ( 0.104,  0.0028),
        ( 0.112,  0.0038), ( 0.120,  0.0032), ( 0.128,  0.0005), ( 0.140, -0.0020),
    ]
    x_span = mix(0.036, 0.062, sstep(-0.010, 0.050, y))
    w_front = sstep(x_span, 0.008, ax) * sstep(0.020, 0.065, z)
    z = z + prof_smooth(dz_f_rows, y) * w_front

    # 2. Smooth monotonic Side Under-Chin curve dy_under(z): gentle clean slope from front chin tip back toward neck
    dy_u_rows = [
        (0.030,  0.0040), (0.050,  0.0022), (0.068,  0.0006), (0.085,  0.0006),
        (0.100,  0.0004), (0.106, -0.0004), (0.114, -0.0024), (0.125, -0.0028),
    ]
    # Apply to under-chin surface (y < -0.055), keeping centre bottom at z=+103 mm fixed while arching behind it
    w_under = sstep(-0.052, -0.082, y) * sstep(0.020, 0.042, z) * sstep(0.052, 0.018, ax)
    y = y + prof(dy_u_rows, z) * w_under

    # 3. Side Back Profile correction dz_back(y): tucks upper-back crown (+104..+132 mm) and lower behind-ear (-24..-52 mm)
    dz_b_rows = [
        (-0.065,  0.0000), (-0.052,  0.0024), (-0.044,  0.0036), (-0.036,  0.0054),
        (-0.024,  0.0028), (-0.012, -0.0004), ( 0.000, -0.0022), ( 0.020, -0.0026),
        ( 0.040, -0.0010), ( 0.060,  0.0004), ( 0.076,  0.0018), ( 0.092,  0.0022),
        ( 0.104,  0.0026), ( 0.116,  0.0048), ( 0.128,  0.0075), ( 0.140,  0.0090),
    ]
    w_back = sstep(0.005, -0.028, z)
    z = z + prof(dz_b_rows, y) * w_back
    # Also tuck very top-back crown height (y > +0.110, z < +0.010) by -2.2 mm so 12:30 o'clock matches red
    y = y - 0.0022 * sstep(0.105, 0.132, y) * sstep(0.015, -0.035, z)

    # 4. Front & Back Width refinement: fuller U-shaped lower chin in Front view (y = -0.065..-0.106), slimmer above-ear temples (y = +0.020..+0.045)
    dx_w_rows = [
        (-0.112,  0.0085), (-0.102,  0.0075), (-0.092,  0.0048), (-0.080,  0.0030),
        (-0.066,  0.0020), (-0.052,  0.0000), ( 0.015,  0.0000), ( 0.026, -0.0035),
        ( 0.038, -0.0032), ( 0.052, -0.0005), ( 0.085, -0.0010), ( 0.108, -0.0015), ( 0.140, 0.0000),
    ]
    w_lat = sstep(0.006, 0.028, ax)
    x = x + np.sign(x) * prof(dx_w_rows, y) * w_lat

    # 5. Ear-level side narrowing (clean_turn_front.png): the reference face edge runs straight down from the temple
    #    (81.7 mm half-width at +40 mm) to the jaw, 74.5 mm at eye/ear level, with the ears standing clear outside it.
    #    Only the outer band (|x| > 52 mm) is pulled in, so eyes, nose and cheeks keep their shape.
    dn_rows = [(-0.064, 0.0), (-0.050, 0.0075), (-0.040, 0.0108), (-0.030, 0.0133), (-0.020, 0.0142), (-0.010, 0.0146),
               (0.000, 0.0148), (0.010, 0.0142), (0.020, 0.0097), (0.030, 0.0030), (0.040, 0.0)]
    x = x - np.sign(x) * prof_smooth(dn_rows, y) * sstep(0.052, 0.090, ax)

    return np.stack([x, y, z], 1)

# The rig's neck in this head frame (HeroBody NECK_M with Pharmacist.js outfit.neck, bind pose), measured in the studio page
# (tools/blender/neck_probe.mjs): rings (y, half-width x, front z, back z), metres. Re-measure when either neck changes.
NECK_RINGS = [(-0.1642, 0.0628, 0.0609, -0.0546), (-0.1494, 0.0613, 0.0630, -0.0482), (-0.1346, 0.0601, 0.0609, -0.0405),
              (-0.1198, 0.0592, 0.0578, -0.0333), (-0.1050, 0.0586, 0.0568, -0.0272), (-0.0902, 0.0578, 0.0558, -0.0229),
              (-0.0754, 0.0575, 0.0548, -0.0216), (-0.0606, 0.0565, 0.0530, -0.0224), (-0.0458, 0.0548, 0.0509, -0.0238),
              (-0.0310, 0.0553, 0.0506, -0.0277)]
# head into neck (the sheet's back and profile panels: the nape and the skin behind the ears narrow gradually into the neck,
# 70 -> 57 mm half-width from y -48 to -81 mm, no collar): below ys the head's back and sides become a skirt that runs into
# the neck at a shallow angle and ends just inside it (inside, in neck radii) at yj (higher at the back centre, where the
# sheet's nape meets the neck sooner). The front (jaw, beard) is left alone: ang = the angle from the back (deg) where the
# blend fades out.
NECK_BLEND = dict(ys=-0.052, yj=(-0.074, -0.082), inside=0.03, ang=(85.0, 112.0))

def neck_at(y):
    """The rig's neck at height y: half-width a, centre z, half-depth b (an ellipse, as HeroBody builds it)."""
    Y = [r[0] for r in NECK_RINGS]
    a = np.interp(y, Y, [r[1] for r in NECK_RINGS]); zf = np.interp(y, Y, [r[2] for r in NECK_RINGS]); zb = np.interp(y, Y, [r[3] for r in NECK_RINGS])
    return a, 0.5 * (zf + zb), 0.5 * (zf - zb)

def blend_neck(P):
    """The head's lower back and sides (below NECK_BLEND ys) as a skirt that runs smoothly into the rig's neck: each vertex
    outside the neck keeps its share f of the head's excess over the neck at ys (in the neck ellipse's own units) and is moved
    down the skirt to where the skirt's excess is that share; the skirt goes into the neck at yj."""
    NB = NECK_BLEND; x, y, z = P[:, 0], P[:, 1], P[:, 2]
    a, zc, b = neck_at(y); dz = z - zc; e = np.hypot(x / a, dz / b)
    th = np.degrees(np.arctan2(np.abs(x), -dz))
    # the head's wall at ys, per angle (its outermost skin in a thin band)
    a_s, zc_s, b_s = neck_at(NB['ys']); band = np.abs(y - NB['ys']) < 0.0015
    th_b = np.degrees(np.arctan2(np.abs(x[band]), -(z[band] - zc_s))); e_b = np.hypot(x[band] / a_s, (z[band] - zc_s) / b_s)
    bins = np.arange(0, 181, 5.0); Es = np.array([e_b[np.abs(th_b - c) < 3.5].max() if (np.abs(th_b - c) < 3.5).any() else np.nan for c in bins])
    ok = ~np.isnan(Es); Ds = np.maximum(np.interp(th, bins[ok], Es[ok]) - 1 + NB['inside'], 0.01)
    yj = mix(NB['yj'][0], NB['yj'][1], sstep(0.0, 45.0, th))
    f = np.clip((e - 1 + NB['inside']) / Ds, 0, 1)
    # skirt excess q(u) = 1 - u^2: leaves the head's wall vertically and goes into the neck at a clear angle (~25 deg). A
    # tangential join leaves the two surfaces within a millimetre of each other, and since the neck there is skinned partly to
    # the neck bone they cross back and forth (a jagged dark line), worse as the head turns
    # position along the skirt: by the share of the excess (the underside) or by height (the wall below ys), whichever is further
    # down, so vertices keep their order (none is pulled up past its neighbours, which folded the mesh into streaks)
    u = np.maximum(np.sqrt(1 - f), np.clip((NB['ys'] - y) / (NB['ys'] - yj), 0, 1))
    y2 = NB['ys'] - u * (NB['ys'] - yj); e2 = 1 - NB['inside'] + (1 - u * u) * Ds
    ux, uz = x / (a * np.maximum(e, 1e-6)), dz / (b * np.maximum(e, 1e-6))
    outside = e > 1 - NB['inside']
    # the head's underside already inside the neck goes further in, so no face between it and the skirt pokes through the
    # neck's concave back
    e2 = np.where(outside, e2, np.minimum(e, 0.85)); y2 = np.where(outside, y2, y)
    a2, zc2, b2 = neck_at(y2)
    Q = np.stack([a2 * ux * e2, y2, zc2 + b2 * uz * e2], 1)
    w = sstep(NB['ang'][1], NB['ang'][0], th) * (y < NB['ys'])
    Pn = P + (Q - P) * w[:, None]
    return Pn, np.linalg.norm(Pn - P, axis=1)

# The jaw in the front view (FACE_LINES jaw): the sheet's Front Face and 3/4 panels (and pharmacist-reference.jpg) have a
# longer lower face than its Left Profile panel (eye to chin 106 / 105 / 100 sheet px), and the head was fitted to the profile.
# Here it follows the front: below `top` (front-frame row) the face is stretched down by k, so the beard's bottom moves from
# v 678 to the sheet's 700, and each row's width is scaled onto the sheet's jaw line (scale: row -> factor, measured on the
# beard outline of the front render against FACE_LINES jaw, rows after the stretch). Only the front of the head (z > 0);
# the nape is blend_neck's. In profile the chin now sits ~8 mm below the Left Profile panel's.
JAW_FIT = dict(top=560, k=1.1864,
               # a smooth curve through the measured factors: row-to-row wobble showed as ridges on the skin under the ears
               scale=[(540, 1.040), (548, 1.052), (556, 1.057), (564, 1.056), (572, 1.048), (580, 1.034), (588, 1.014),
                      (596, 0.988), (604, 0.958), (612, 0.922), (620, 0.882), (628, 0.838), (636, 0.790), (644, 0.738),
                      (652, 0.683), (660, 0.624), (668, 0.570), (676, 0.780), (684, 1.080), (692, 1.300), (700, 1.400)])

def lock_jaw(P):
    """Lower face onto the sheet's front jaw line (JAW_FIT): stretched down below `top`, then scaled in width row by row (the
    skin behind the beard is held inside it afterwards, behind_beard)."""
    x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2]
    # both only in the jaw itself, fading out in front of the ear: fading out under it put a kink in the head's wall that
    # blend_neck's skirt then carried (a notch below the ear lobe) and sheared the skin into a crease
    jaw = sstep(0.018, 0.048, z)
    ya = ry_(JAW_FIT['top'])
    y = mix(y, np.where(y < ya, ya + (y - ya) * JAW_FIT['k'], y), jaw)
    rows = sorted((ry_(v), s) for v, s in JAW_FIT['scale'])
    s = np.interp(y, [r[0] for r in rows], [r[1] for r in rows])
    s = mix(1.0, s, jaw * sstep(ry_(520), ry_(545), y))          # from the mouth line down
    return np.stack([x * s, y, z], 1)

def behind_beard(P):
    """On the sheet the beard reaches the jaw's outline in the front view; here the head behind the beard's back edge (below
    the ears, where blend_neck's skirt starts) was wider than the beard, so skin showed outside it. Row by row, the head behind
    the beard's back edge (the profile's neckline) is narrowed smoothly, just enough that it stays inside the beard's widest
    point at that row, but never pushed into the neck (a hard clamp left a crease there)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; L = BEARD_LINES; vrow = 378 - (y - 0.014) / PX; ax = np.abs(x)
    inb = poly_sd(z, y, side_pts(L['cheek'] + [(40, 544), (40, 720), (160, 720), (176, 668)] + [p for p in L['neck'] if p[0] >= 185])) > 0.001
    nl = sorted((v, (400 - u) * PX) for u, v in L['neck'] if u >= 255)
    ze = np.interp(vrow, [p[0] for p in nl], [p[1] for p in nl])
    # behind the beard, at the sides, starting a little behind its edge (no step where the beard's back edge stands proud)
    wz = sstep(ze - 0.004, ze - 0.022, z) * sstep(0.03, 0.05, ax) * (~inb)
    bins = np.arange(530.0, 650.0, 4.0); fr = []
    for b in bins:
        row = np.abs(vrow - b) < 3; selb = inb & row; selh = row & (wz > 0.5)
        if not selb.any() or not selh.any(): fr.append(1.0); continue
        lim = max(ax[selb].max() - 0.001, neck_at(np.array([ry_(b)]))[0][0] + 0.0008)
        fr.append(min(1.0, lim / ax[selh].max()))
    fr = np.convolve(np.pad(np.array(fr), 4, mode='edge'), np.ones(9) / 9, mode='valid')   # smooth across rows: no ridges
    f = np.interp(vrow, bins, fr)
    win = sstep(530, 545, vrow) * sstep(650, 634, vrow)
    Q = P.copy(); Q[:, 0] = x * (1 - (1 - f) * wz * win)
    return Q, np.abs(Q[:, 0] - x)

def skull_points(D, F):
    """Skin points (final head frame), design-space points and how far blend_neck / behind_beard moved each one (metres)."""
    P0 = np.stack([D[:, 0] * F['rx'], D[:, 1] * F['ry'], D[:, 2] * F['rz']], 1)
    Pd = sculpt(P0, F)                       # design space (masks are authored here)
    P, moved = blend_neck(lock_jaw(lock_profiles(warp_face(Pd, F) * HS)))
    P, moved2 = behind_beard(P)
    return P, Pd, moved + moved2

# --------------------------------------------------------------------------- mesh helpers (t-frame → Blender axes)
COLL = 'PharmacistHead'
def coll(name=COLL):
    """Everything the builder makes lives in its own collection (so a live session leaves the user's scene alone)."""
    c = bpy.data.collections.get(name)
    if c is None: c = bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    return c

def to_bl(P): return np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
def from_bl(P): return np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)

def make_object(name, verts_t, faces, uv=None, origin=None):
    """origin (t-frame) puts the object origin there (vertices stored relative to it), e.g. at an eyeball's centre."""
    V = np.asarray(verts_t, dtype=float)
    if origin is not None: V = V - np.asarray(origin)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in to_bl(V)], [], faces)
    me.update(); ob = bpy.data.objects.new(name, me)
    coll().objects.link(ob)
    if origin is not None: ob.location = tuple(to_bl(np.asarray(origin, dtype=float)[None])[0])
    for p in me.polygons: p.use_smooth = True
    if uv is not None:                        # per-vertex uv → loop uv, with the u wrap-around seam split per polygon
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            us = [uv[me.loops[li].vertex_index][0] for li in poly.loop_indices]
            wrap = (max(us) - min(us)) > 0.5
            for li in poly.loop_indices:
                u, v = uv[me.loops[li].vertex_index]
                layer.data[li].uv = (u + 1.0 if wrap and u < 0.5 else u, v)
    return ob

def set_colours(ob, c):
    """Per-vertex colour 'Col' (grey multiplier c per vertex, or an (n, 3) array) as the active colour (exported as COLOR_0)."""
    c = np.asarray(c, dtype=np.float32); rgb = np.repeat(c[:, None], 3, 1) if c.ndim == 1 else c
    rgba = np.concatenate([rgb, np.ones((len(rgb), 1), np.float32)], 1)
    col = ob.data.color_attributes.get('Col') or ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', rgba.ravel()); ob.data.color_attributes.active_color = col

def cube_sphere(cuts, refine=()):
    """Cube-sphere directions + faces. refine = [(unit direction, angle rad, cuts)] subdivides faces near those directions."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts - 1, use_grid_fill=True)
    # Blender cube is z-up; the head frame wants +z forward → swap axes (a cube-face centre then points forward)
    for v in bm.verts: v.co = (v.co.x, v.co.z, v.co.y)
    bm.normal_update(); bmesh.ops.reverse_faces(bm, faces=bm.faces[:])        # the axis swap mirrors the winding
    for d, ang, nc in refine:
        d = np.asarray(d, dtype=float); d /= np.linalg.norm(d); cosang = math.cos(ang)
        sel = [f for f in bm.faces if np.dot(np.array(f.calc_center_median()[:]) / np.linalg.norm(f.calc_center_median()), d) > cosang]
        edges = list({e for f in sel for e in f.edges})
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=nc, use_grid_fill=True)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    D = np.array([v.co[:] for v in bm.verts], dtype=np.float64); D /= np.linalg.norm(D, axis=1, keepdims=True)
    faces = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return D, faces

def vertex_normals(ob):
    n = np.zeros(len(ob.data.vertices) * 3); ob.data.vertex_normals.foreach_get('vector', n)
    return from_bl(n.reshape(-1, 3))

def spherical_uv(P):
    return np.stack([np.arctan2(P[:, 0], P[:, 2]) / (2 * math.pi) + 0.5, np.arcsin(np.clip(P[:, 1] / np.linalg.norm(P, axis=1), -1, 1)) / math.pi + 0.5], 1)

# --------------------------------------------------------------------------- eyes: carve the lids into the skin around the eyeball
EYE_D = (FACE_LINES['eye_up'][0][0], FACE_LINES['eye_up'][-1][0])     # inner / outer eye corner (px from the centre line)
# iris and pupil as polar angles on the eyeball / pi (the rig's eyeTexture irisR / pupilR, Pharmacist.js): the sheet's iris
# radius (FACE_LINES iris, 20.5 px = 8.4 mm) on the 21 mm eyeball, the pupil about half of it
IRIS = (round(math.asin(FACE_LINES['iris'][2] * PX / EYE['R']) / math.pi, 3), round(math.asin(0.52 * FACE_LINES['iris'][2] * PX / EYE['R']) / math.pi, 3))

def lid_margins(d, ku=1.0, kl=1.0):
    """Upper and lower lid margins (y, metres) at d px from the centre line, from FACE_LINES eye_up / eye_lo, and the line
    joining the corners. ku / kl scale the opening about that line (1 = the sheet's eye; the squint uses less)."""
    U, Lo = ry_(prof_smooth(FACE_LINES['eye_up'], d)), ry_(prof_smooth(FACE_LINES['eye_lo'], d))
    (d0, v0), (d1, v1) = FACE_LINES['eye_up'][0], FACE_LINES['eye_up'][-1]
    C = ry_(v0 + (v1 - v0) * np.clip((d - d0) / (d1 - d0), 0, 1))
    return C + ku * (U - C), C - kl * (C - Lo), C

def eye_centres(P, bvh):
    out = []
    for s in (1, -1):
        ex, ey = s * F['eyeX'] * HS, F['eyeY'] * HS + EYE['dy']
        hit = bvh.ray_cast(Vector((ex, -0.6, ey)), Vector((0, 1, 0)))        # Blender: face looks toward -y
        nat = -hit[0].y if hit[0] is not None else 0.09
        out.append((ex, ey, nat + EYE['protrude'] - EYE['R'], nat))
    return out

def carve_lids(P, centres, ku=(1.0, 1.0), kl=(1.0, 1.0), shut=(False, False)):
    """Lids of both eyes carved into the skin: skin draped over the eyeball sphere, with the opening of FACE_LINES (eye_up /
    eye_lo). ku / kl per eye scale the opening (lid_margins); shut closes that eye (the upper lid comes down just past the lower
    one). Returns (P, shade) – shade is a per-vertex colour multiplier (dark lash line on the lid margin, darker lid skin)."""
    P = P.copy(); R = EYE['R']; shade = np.ones(len(P))
    d_in, d_out = EYE_D; dm, hw = 0.5 * (d_in + d_out), 0.5 * (d_out - d_in)
    for (ex, ey, ez, nat0), ku_, kl_, sh in zip(centres, ku, kl, shut):
        dx, dy = P[:, 0] - ex, P[:, 1] - ey; r2 = dx * dx + dy * dy
        m = (P[:, 2] > 0.03) & (r2 < (R * 1.25) ** 2) & (P[:, 0] * ex > 0)
        if not m.any(): continue
        dp = np.abs(P[m, 0]) / PX; ym = P[m, 1]
        Yu, Yl, Yc = lid_margins(dp, ku_, kl_)
        tt = np.clip(1 - ((dp - dm) / hw) ** 2, 0, 1) ** 0.72
        if sh: Yu = Yl - 0.0014 * tt
        dv = np.maximum(ym - Yu, Yl - ym); dh = np.maximum(d_in - dp, dp - d_out) * PX
        d = np.sqrt(np.maximum(dv, 0) ** 2 + np.maximum(dh, 0) ** 2) + np.minimum(np.maximum(dv, dh), 0)
        inside_sph = r2[m] < R * R
        sph = ez + np.sqrt(np.maximum(R * R - r2[m], 0)); nat = P[m, 2]
        bump = EYE['lidT'] * np.exp(-(np.maximum(d, 0) / 0.0022) ** 2)
        lid = np.where(inside_sph, np.maximum(nat, sph + EYE['clear'] + bump), nat); ap = np.where(inside_sph, np.minimum(nat, sph - 0.0007), nat)
        win = sstep(0.0004, -0.0004, d)
        z = lid * (1 - win) + ap * win
        if sh:                                                          # closed: a thin groove where the lashes meet
            z = z - 0.0005 * np.exp(-((ym - (Yl + 0.0016 * tt)) / 0.0011) ** 2) * (tt > 0.05)
        else:                                                           # gentle upper eyelid fold crease above the eye
            crease = np.exp(-((ym - (Yu + 0.0046)) / 0.0016) ** 2) * (tt > 0.12)
            z = z - 0.0006 * crease * (1 - win)
        P[m, 2] = z
        # crisp bold dark upper lash band + softer lower lid definition + upper lid crease shading
        up = ym > Yc + 0.0008 * tt
        lash_u = np.exp(-((d - 0.0002) / 0.00115) ** 2) * up
        lash_l = np.exp(-((d - 0.0001) / 0.00075) ** 2) * ~up
        s_ = (1 - 0.88 * lash_u * (tt > 0.02)) * (1 - 0.42 * lash_l * (tt > 0.02))
        s_ = s_ * (1 - 0.16 * np.exp(-(np.maximum(d, 0) / 0.0042) ** 2) * (d > 0))
        if not sh:
            cr_s = np.exp(-((ym - (Yu + 0.0046)) / 0.0018) ** 2) * (tt > 0.12)
            s_ = s_ * (1 - 0.18 * cr_s)
        shade[m] = np.minimum(shade[m], s_)
    return P, shade

def eyeball(name, centre, R, tex_img):
    ex, ey, ez = centre; W, H = 64, 40
    verts, uvs, faces = [], [], []
    for j in range(H + 1):
        phi = math.pi * j / H
        for i in range(W + 1):
            th = 2 * math.pi * i / W
            verts.append((ex + R * math.sin(phi) * math.cos(th), ey + R * math.sin(phi) * math.sin(th), ez + R * math.cos(phi)))
            uvs.append((i / W, 1 - j / H))
    for j in range(H):
        for i in range(W):
            a = j * (W + 1) + i; faces.append([a, a + W + 1, a + W + 2, a + 1])     # outward normals
    ob = make_object(name, np.array(verts), faces, np.array(uvs), origin=(ex, ey, ez))   # origin at the centre: the rig turns it for gaze
    ob.data.materials.append(tex_img)
    return ob

def ear_mesh(s, E):
    """Smooth Pixar-style sculpted ear: clean C-shaped rolled helix, soft antihelix, dished concha, rounded lobe."""
    NU, NV = 36, 32; verts, faces = [], []
    for j in range(NV + 1):
        for i in range(NU + 1):
            th = i / NU * 2 * math.pi; ph = (j / NV - 0.5) * math.pi
            sp = math.sin(ph); cp = math.cos(ph); ct = math.cos(th); st = math.sin(th)
            # clean rounded ear silhouette: wider smooth upper helix, gently tapering into a full rounded lobe
            w_scale = 1.0 + 0.16 * float(sstep(-0.25, 0.55, sp)) - 0.14 * float(sstep(-0.35, -0.92, sp))
            # back-tilt of ear top slightly backwards (+z is front, -z is back in ear local)
            z_tilt = -0.0028 * sp
            x = cp * ct * 0.0082
            y = sp * 0.0285
            z = cp * st * 0.0172 * w_scale + z_tilt
            if ct > 0:
                # inner face of ear: smooth concha bowl + rolled outer helix rim + gentle antihelix ridge
                r_face = math.hypot((z - z_tilt) / (0.0172 * w_scale), y / 0.0285)
                dish = float(sstep(-0.016, -0.001, y)) * (1.0 - 0.25 * float(sstep(0.012, 0.028, y)))
                bowl = math.exp(-((r_face / 0.62) ** 2.4))
                helix = math.exp(-(((r_face - 0.86) / 0.16) ** 2)) * float(sstep(-0.014, 0.004, y))
                anti = math.exp(-(((r_face - 0.52) / 0.14) ** 2)) * float(sstep(-0.010, 0.005, y)) * (1.0 - float(sstep(0.010, 0.022, y)))
                x += (-0.0068 * bowl * dish + 0.0022 * helix + 0.0018 * anti) * (ct ** 0.7)
            verts.append((x, y, z))
    for j in range(NV):
        for i in range(NU):
            a = j * (NU + 1) + i; f = [a, a + 1, a + NU + 2, a + NU + 1]
            faces.append(f[::-1] if s > 0 else f)                       # outward normals (the s < 0 copy is mirrored)
    V = np.array(verts) * np.array([1.15 * E['scale'], 1.2 * E['scale'] * E['sy'], 1.2 * E['scale']])
    if s < 0: V[:, 0] *= -1                                             # mirror first, then rotate (as three.js: scale before rotation)
    rz, ry = s * -0.05, s * E['rot']                                  # three.js Euler XYZ (0, ry, rz): Rz first, then Ry
    c, sn = math.cos(rz), math.sin(rz); V = np.stack([V[:, 0] * c - V[:, 1] * sn, V[:, 0] * sn + V[:, 1] * c, V[:, 2]], 1)
    c, sn = math.cos(ry), math.sin(ry); V = np.stack([V[:, 0] * c + V[:, 2] * sn, V[:, 1], -V[:, 0] * sn + V[:, 2] * c], 1)
    V += np.array([s * (F['rx'] - E['inset']), E['y'], E['z']])
    return make_object('ear_L' if s > 0 else 'ear_R', V * HS, faces)

# --------------------------------------------------------------------------- brows, hair, beard, glasses
def brows(skin_bvh_z):
    pts = [(354, 309), (327, 301), (296, 298), (263, 305), (235, 320)]; wid = [0.0034, 0.0040, 0.0038, 0.0029, 0.0013]
    C = np.array([(rx_(x), ry_(y)) for x, y in pts]); W = np.array(wid)
    u = np.linspace(0, 1, 48); idx = np.linspace(0, len(C) - 1, 48)
    cx = np.interp(idx, range(len(C)), C[:, 0]); cy = np.interp(idx, range(len(C)), C[:, 1])
    # rounded inner & outer caps (no sharp rectangular cutoff at brow head/tail)
    cap = np.sqrt(np.clip(np.minimum(u / 0.08, (1 - u) / 0.08), 0.0, 1.0))
    w = np.interp(idx, range(len(C)), W) * (0.25 + 0.75 * cap)
    tan = np.stack([np.gradient(cx), np.gradient(cy)], 1); tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1); K = 9; objs = []
    for s in (1, -1):                       # reference crop: viewer-left brow has x < 0
        verts, faces = [], []
        for i in range(len(cx)):
            for k in range(K):
                a = k / (K - 1) * 2 - 1
                x = cx[i] + nrm[i, 0] * a * w[i]; y = cy[i] + nrm[i, 1] * a * w[i]
                z = skin_bvh_z(-x if s > 0 else x, y) + 0.0003 + 0.0017 * math.sqrt(max(0, 1 - a * a)) * (w[i] / 0.0045) * (0.3 + 0.7 * cap[i])
                verts.append((-x if s > 0 else x, y, z))
        for i in range(len(cx) - 1):
            for k in range(K - 1):
                a = i * K + k; f = [a, a + 1, a + K + 1, a + K]; faces.append(f if s > 0 else f[::-1])   # outward normals
        objs.append(make_object('brow_L' if s > 0 else 'brow_R', np.array(verts), faces))
    return objs

def shell(name, skin, P, Pd, mask, thick, noise_amp=0.0, seed=0, keep=0.003):
    """Offset copy of the skin faces where mask > keep. Thickness tapers with the mask and goes below the skin where the
    mask fades out, so the visible edge is the smooth line where the shell dips into the skin (not the face staircase)."""
    me = skin.data; faces = [list(p.vertices) for p in me.polygons]
    use = np.array([mask[f].max() > keep for f in faces])
    vmap = {}; nf = []
    for f, u in zip(faces, use):
        if not u: continue
        row = []
        for v in f:
            if v not in vmap: vmap[v] = len(vmap)
            row.append(vmap[v])
        nf.append(row)
    keepidx = np.array(sorted(vmap, key=vmap.get))
    nrm = vertex_normals(skin); jit = np.random.RandomState(seed).rand(len(P))
    # sleek tapered edge: smooth power ramp so hair & beard blend cleanly into the barber-faded skin
    tk = thick * (mask ** 0.92) + noise_amp * 0.0035 * (jit - 0.5) * sstep(0.20, 0.65, mask) - 0.00015 * (1 - sstep(0.0, 0.08, mask))
    offs = nrm[keepidx] * tk[keepidx, None]
    ob = make_object(name, P[keepidx] + offs, nf, spherical_uv(P[keepidx]))
    ob['_keep'] = len(keepidx)
    return ob, keepidx, offs      # a deformed skin Pk gives the matching shell positions Pk[keepidx] + offs (shape keys)

def fade_lines(P):
    """HAIR_FADE's side and back lines placed on this skin and ordered by azimuth around the head (atan2(|x|, z): 0 front,
    pi back): a side point (z, y) lands on the outermost skin vertex there, a back point (|x|, y) on the rearmost one.
    Returns [(azimuth, y_dense, y_skin), ...]."""
    ax = np.abs(P[:, 0]); out = []
    for dk, sk, view in (('side_dense', 'side_skin', 'side'), ('back_dense', 'back_skin', 'back')):
        for (u, vd), (_, vs) in zip(HAIR_FADE[dk], HAIR_FADE[sk]):
            yd, ys = ry_(vd), ry_(vs); near = np.abs(P[:, 1] - 0.5 * (yd + ys)) < 0.002
            if view == 'side':
                sel = near & (np.abs(P[:, 2] - (400 - u) * PX) < 0.002); pick = np.argmax
                key = ax
            else:
                sel = near & (np.abs(ax - u * PX) < 0.002) & (P[:, 2] < 0); pick = np.argmin
                key = P[:, 2]
            if not sel.any(): continue
            i = np.where(sel)[0][pick(key[sel])]
            out.append((math.atan2(ax[i], P[i, 2]), yd, ys))
    return sorted(out)

def masks(P, Ps, lip_top):
    """Hair & beard masks (final metres). Hair: authored on the 10 mm side/front/back reference grid, with the graded fade of
    HAIR_FADE. Beard: the BEARD_LINES reference lines, evaluated on Ps (the skin at the sheet's smile, REF_SMILE); lip_top =
    the upper lip's top edge at that smile, centre to corner [(x, y), ...], so the moustache ends on the lip.
    Returns a dict: hair / beard (shell masks), fade (hair and stubble density to paint on the skin, 0..1), taper (hair shell
    thickness factor), z_lineup / y_min (the hairline's front and bottom), stub (cheek stubble), full (moustache fullness)."""
    xf, yf, zf = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(xf)

    # --- HAIR MASK (matched square-for-square to hair-side-grid.png + front/back references) ---
    # 1. Lower boundary y_min(zf): stays above +14 mm over the ear, drops right behind the ear (back edge z ~ 0) to the -43.5 mm nape
    y_min_rows = [
        (-0.080, -0.0432), (-0.014, -0.0438), (-0.006, -0.0390), ( 0.001, -0.0315),
        ( 0.005, -0.0150), ( 0.012,  0.0138), ( 0.018,  0.0145), ( 0.045,  0.0148), ( 0.120,  0.0150),
    ]
    y_min = prof(y_min_rows, zf)
    # ramp across the edge (not just in height): where the edge drops steeply behind the ear it stays ~2 mm wide, no staircase
    slope = (prof(y_min_rows, zf + 0.001) - prof(y_min_rows, zf - 0.001)) / 0.002
    above_bottom = sstep(-0.0003, 0.0019, (yf - y_min) / np.sqrt(1 + slope * slope))

    # 2. Top forehead horizontal cap: lowered 1.2 mm onto the red forehead hairline
    y_forehead = 0.0924 - 0.0012 * sstep(0.020, 0.062, ax)
    top_cap = sstep(y_forehead - 0.0003, y_forehead + 0.0019, yf)

    # 3. Temple vertical drop + barber C-hook + concave taper above glasses arm; full coverage across the back (zf < +0.025)
    z_temple_rows = [
        (0.012, 0.0385), (0.020, 0.0440), (0.030, 0.0535), (0.040, 0.0635),
        (0.048, 0.0662), (0.056, 0.0674), (0.064, 0.0678), (0.078, 0.0680), (0.091, 0.0702), (0.140, 0.1250),
    ]
    z_lineup = prof(z_temple_rows, yf)
    not_forehead = np.maximum(sstep(0.032, 0.046, ax), sstep(0.040, 0.015, zf))
    side_temple = sstep(z_lineup + 0.0003, z_lineup - 0.0020, zf) * not_forehead

    # Carve clean pocket inside the ear concha bowl (remove front-of-ear overhang)
    ear_bowl = np.hypot((zf - 0.018) / 0.0135, (yf + 0.006) / 0.0195)
    ear_clear = mix(1.0, sstep(0.75, 1.08, ear_bowl), sstep(0.048, 0.062, ax))

    # --- GRADED FADE (HAIR_FADE) ---
    # behind the ears and across the nape: the density across the band between the sheet's dense and skin lines (at this
    # vertex's azimuth); tr runs 0 (skin) .. 1 (dense) with smoothstep 0.2 / 0.8 on the two lines, and on above them
    FL = fade_lines(P); phs = [p[0] for p in FL]; phi = np.arctan2(ax, zf)
    y_dn, y_sk = np.interp(phi, phs, [p[1] for p in FL]), np.interp(phi, phs, [p[2] for p in FL])
    T = (y_dn - y_sk) / 0.42; tr = (yf - (y_sk - 0.29 * T)) / T
    w_b = sstep(0.004, -0.004, zf)                                    # behind the ears; above and in front of them the edge stays
    dens_b = sstep(0.0, 1.0, tr) * sstep(1.0, 1.4, ear_bowl) * w_b   # skin kept clear round the ear
    bottom = mix(above_bottom, sstep(0.76, 0.84, tr), w_b)            # the shell stops where the density reaches ~0.9
    # temples (in front of the ears, behind the lineup): shorter and lighter toward the glasses arm
    w_t = sstep(0.030, 0.040, zf) * sstep(0.040, 0.050, ax)
    lineup = sstep(z_lineup + 0.0003, z_lineup - 0.0020, zf) * not_forehead
    dens_t = prof_smooth([(h * 0.001, d) for h, d in HAIR_FADE['temple']], yf)
    hair = np.maximum(top_cap, side_temple) * bottom * ear_clear * mix(1.0, sstep(0.76, 0.82, dens_t), w_t)
    fade = np.maximum(dens_b, dens_t * w_t * lineup)
    # shell thickness: thins out over the band above where it starts, so it ends flush with the painted fade
    taper = mix(1.0, sstep(0.80, 1.30, tr), w_b) * mix(1.0, sstep(0.80, 1.0, dens_t), w_t)

    # --- BEARD: the reference lines (BEARD_LINES) on the skin at the sheet's smile ---
    xs, ys, zs = Ps[:, 0], Ps[:, 1], Ps[:, 2]
    L = BEARD_LINES
    # profile region (a prism across x, so it holds on both sides): sideburn, the diagonal cheek line, the neckline under the
    # jaw and the back edge below the ear; in front of the moustache corner it runs straight down past the chin, and under the
    # chin it reaches below the silhouette so the chin's underside stays bearded up to where the neckline leaves it
    side = poly_sd(zs, ys, side_pts(L['cheek'] + [(40, 544), (40, 720), (160, 720), (176, 668)] + [p for p in L['neck'] if p[0] >= 185]))
    # front regions: the moustache under the nose (its corner runs on down into the beard), and the opening (lips + the shaved
    # skin round the soul patch) it stops at
    mst = poly_sd(xs, ys, mirror(front_pts(L['mst'] + [(111, 560)])))
    hole = poly_sd(xs, ys, mirror(list(lip_top) + front_pts(L['shave'])))
    front = sstep(0.050, 0.065, zf)
    m_mst = grow(mst) * front
    # sideburns: from the glasses arm down they are faded stubble (HAIR_FADE sideburn), dense beard from ~-22 mm down
    w_sb = sstep(0.070, 0.064, zs) * sstep(0.045, 0.055, np.abs(xs))
    dens_sb = mix(1.0, prof_smooth([(h * 0.001, d) for h, d in HAIR_FADE['sideburn']], ys), w_sb)
    g_side = grow(side)
    beard = np.maximum(g_side * sstep(0.86, 0.94, dens_sb), m_mst) * mix(1.0, carve(hole), front)
    fade = np.maximum(fade, g_side * dens_sb * w_sb)
    full = m_mst * sstep(ry_(540), ry_(526), ys)          # the moustache band over the lip stands fuller; its corners blend in
    # faded stubble on the skin just outside the cheek line and the sideburn (painted by skin_detail), up to the sheet's faint
    # outer edge; not round the nose or lips, and the neckline stays clean
    stub = sstep(-0.0055, -0.0003, side) * sstep(0.030, 0.042, ax) * sstep(ry_(590), ry_(560), yf) * (1 - beard)
    btaper = mix(1.0, sstep(0.90, 1.0, dens_sb), w_sb)    # the beard thins toward its top edge on the sideburn (no ledge)
    return dict(hair=hair, beard=beard, fade=fade, taper=taper, btaper=btaper, z_lineup=z_lineup, y_min=y_min, stub=stub, full=full)

# acetate frame (metres): the rim's cross-section is an ellipse, half-width w in the lens plane and half-depth d along the
# view (the sheet's rims read ~2.2-2.7 mm wide from the front, the sharper pharmacist-reference.jpg 2.6 mm; deeper in
# profile); bridge and arm radii
GLASSES = dict(rimW=0.00135, rimD=0.0017, bridge=0.0016, arm=0.00118)

def rim_shape(n_pts=128):
    """FACE_LINES rim as metres: lens centre (LX, cy), half sizes (a, b), exponent n, and the centre line around one lens
    (offsets sx, sy from its centre, counter-clockwise seen from the front) with its outward in-plane normals."""
    d0, v0, a_px, b_px, n = FACE_LINES['rim']
    LX, cy, a, b = d0 * PX, ry_(v0), a_px * PX, b_px * PX
    th = np.linspace(0, 2 * math.pi, n_pts, endpoint=False); c, s = np.cos(th), np.sin(th)
    sx = np.sign(c) * np.abs(c) ** (2 / n) * a; sy = np.sign(s) * np.abs(s) ** (2 / n) * b
    gx = np.sign(sx) * np.abs(sx / a) ** (n - 1) / a; gy = np.sign(sy) * np.abs(sy / b) ** (n - 1) / b    # gradient of |x/a|^n + |y/b|^n
    g = np.hypot(gx, gy); return LX, cy, a, b, n, sx, sy, gx / g, gy / g

def glasses(surface_z, eye_front_z=0.100, ear_top=None):
    """Round matte acetate glasses on the sheet's lines (FACE_LINES rim / bridge, FACE_LINES_SIDE arm): flat-faced rims swept
    along the fitted rim line, a straight bridge bar between the rims' inner edges and arms that leave the rims' top outer
    corners and run level back to the ears, resting on them (ear_top = the ear's highest point, metres)."""
    LX, cy, a, b, n, sx, sy, nx, ny = rim_shape(); G = GLASSES; objs = []
    def edge_x(dy): return a * max(0.0, 1 - abs(dy / b) ** n) ** (1 / n)      # half-width of the lens at height dy
    # lens plane: ~5 mm in front of the eyeball cornea, clearing the outer eye/brow/cheek without floating far forward
    zc = max(eye_front_z + 0.0050, max(surface_z(s * LX + u, cy + v) for s in (1, -1) for u, v in zip(sx[::4], sy[::4]) if cy + v < 0.026) + 0.0020)
    K, M = len(sx), 12; al = np.linspace(0, 2 * math.pi, M, endpoint=False)
    faces = [[i * M + j, ((i + 1) % K) * M + j, ((i + 1) % K) * M + (j + 1) % M, i * M + (j + 1) % M] for i in range(K) for j in range(M)]
    for s in (1, -1):
        cx = s * LX
        # rim: elliptic tube; quads (i, i+1) x (j, j+1) face outward (curve tangent x cross-section tangent)
        V = np.stack([cx + sx[:, None] + nx[:, None] * G['rimW'] * np.cos(al)[None],
                      cy + sy[:, None] + ny[:, None] * G['rimW'] * np.cos(al)[None],
                      zc + G['rimD'] * np.sin(al)[None] + 0 * sx[:, None]], -1).reshape(-1, 3)
        objs.append(make_object('rim_L' if s > 0 else 'rim_R', V, faces))
        # lens: flat fan just behind the rim's centre line (the rig gives it a faint reflective material)
        ring = np.stack([cx + sx * 0.985, cy + sy * 0.985, np.full(K, zc - 0.0003)], 1)
        V = np.vstack([[cx, cy, zc - 0.0003], ring])
        objs.append(make_object('lens_L' if s > 0 else 'lens_R', V, [[0, 1 + i, 1 + (i + 1) % K] for i in range(K)]))
    # bridge bar, arms and nose pads (one curve object; the export turns it into a mesh)
    curve = bpy.data.curves.new('frame', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = 0.001; curve.bevel_resolution = 4
    def spline(pts):
        sp = curve.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, (x, y, z, r) in enumerate(pts): sp.points[i].co = (x, -z, y, 1); sp.points[i].radius = r / 0.001   # Blender axes
    yb = ry_(FACE_LINES['bridge'][0][1]); xb = LX - edge_x(yb - cy) + G['rimW'] * 0.5
    zb = max(zc, surface_z(0.0, yb) + 0.0024)
    spline([(-xb, yb, zc, G['bridge']), (-0.007, yb + 0.0003, zb, G['bridge']), (0.007, yb + 0.0003, zb, G['bridge']), (xb, yb, zc, G['bridge'])])
    ya = ry_(FACE_LINES_SIDE['arm'][0][1])                      # the arm's height at the hinge (side panel)
    ear_z = EAR['z'] * HS
    y_ear = min(ya, (ear_top if ear_top is not None else (EAR['y'] + 0.025) * HS) + G['arm'] + 0.0004)   # resting on the ear
    for s in (1, -1):
        xo = LX + edge_x(ya - cy) - G['rimW'] * 0.5
        spline([(s * xo, ya, zc, G['arm'] * 1.15), (s * 0.0720, ya, zc - 0.004, G['arm'] * 1.15), (s * 0.0745, mix(ya, y_ear, 0.35), 0.045, G['arm']),
                (s * 0.0795, y_ear, ear_z + 0.003, G['arm'] * 0.9), (s * 0.0785, y_ear - 0.011, ear_z - 0.020, G['arm'] * 0.75)])
        # nose pad resting against the side of the nose bridge (turnaround 3/4 view)
        px_ = s * (LX - edge_x(0.002) * 0.94)
        spline([(px_, cy + 0.004, zc - 0.0015, 0.0009), (px_ - s * 0.0015, cy - 0.0025, zc - 0.0042, 0.0009)])
    ob = bpy.data.objects.new('frame', curve); coll().objects.link(ob); objs.append(ob)
    log('glasses: lens centre x %.4f y %.4f, %.1f x %.1f mm, plane z %.4f; bridge y %.4f; arm y %.4f -> %.4f at the ear'
        % (LX, cy, 2000 * a, 2000 * b, zc, yb, ya, y_ear))
    return objs

# --------------------------------------------------------------------------- build
# reference: ear aligns eye-to-nose across Front/Side/Back; z puts its front edge where the Left / Right Profile panels have it
# (53 % of the way from the nose tip to the back of the head, side px 300), with the sideburn straight in front of it
EAR = dict(scale=0.98, sy=0.78, y=-0.0085, z=0.0195, inset=0.0100, rot=-0.52)
# lips (design units), sized on the sheet at smile 0.55 (FACE_LINES open_top / open_bot / crease): the upper lip from the
# moustache (v 515) to the opening, the smile parts the lips only in the middle (openEdge of the half-width: the teeth show
# there, v 541..554), outside it they meet on a crease that turns up into the corners (corner_lift, smileCurve); the lower lip
# down to v 575. seam: the lips never quite touch, so the mouth interior shows as a thin dark line out to the corners.
MOUTH = dict(smileW=0.16, smileCurve=0.0120, smileOpen=0.00833, openEdge=0.48, seam=0.00045, lipU=0.0100, lipL=0.0080,
             bulgeU=0.0026, bulgeL=0.0025, teeth=0.0037, upperProfile=0.35, lowerProfile=0.9)
BEARD = dict(t=0.0017, chin=0.0052, jaw=0.0024, corner=0.0030, mst=0.0018)   # close-cropped beard hugging the compact rising jawline

# lip colours (sRGB), on the skin's 0x855237 as the sheet's Front Face panel has them against the skin around the mouth: the
# upper lip a little redder than the skin (sheet r-g 0.27 vs 0.22), the lower lip lighter and pinker (L 0.53 vs 0.39, r-g 0.32)
LIP_TINT = dict(upper=0x8a4a35, lower=0xa45a4a)
# the lower lip is lighter than the skin (factors > 1), but glTF vertex colours are stored 0..1: the lips' colours are stored
# divided by LIP_GAIN, which goes out as the meshes' `lipGain` extra and the rig multiplies back in (HeroHeadGLB)
LIP_GAIN = 2.0

def corner_lift(u):
    """How far the smile lifts the lip line at u (0 centre .. 1 corner): level in the middle, turning up into the corners."""
    return sstep(0.4, 1.0, np.abs(u))

def lip_edges(smile, open_, t):
    """Where the lips meet or part (design units, relative to the mouth origin) across t in [-1, 1], corner to corner: x, the
    upper lip's lower edge yU, the lower lip's upper edge yL and (1 - t^2). Linear in smile (>= 0) and in open_."""
    M = MOUTH; sp, fr = max(0.0, smile), max(0.0, -smile); W = F['lipW'] * (1 + M['smileW'] * sp - 0.04 * fr)
    t2 = t * t; one = np.clip(1 - t2, 0, 1)
    lift = M['smileCurve'] * sp * corner_lift(t) - 0.0038 * fr * t2
    g_s = np.clip(1 - (t / M['openEdge']) ** 2, 0, 1) ** 0.75          # the smile's opening, middle only
    Os, Oo = sp * M['smileOpen'], open_ * 0.0115
    seam = 0.5 * M['seam'] * (1 - 0.6 * t2)
    yU = lift + seam - 0.05 * Os * g_s + 0.28 * Oo * one
    yL = lift - seam - 0.95 * Os * g_s - 0.72 * Oo * one ** 0.8
    return t * W, yU, yL, one

def lip_thickness(t):
    """Lip thicknesses (design units) across t, sized on the sheet at its smile: the upper lip reaches up under the
    moustache's lower edge (BEARD_LINES chk_lip; the moustache overlaps its top 0.9 mm), the lower lip down to its bottom
    edge (FACE_LINES lip_lo), so it ends where that line meets the corner crease. Fixed per t: every expression uses them."""
    oy = warp_face(np.array([[0.0, F['mouthY'], 0.09]]), F)[0, 1] * HS      # the mouth origin's height (as Builder._mouth)
    x, yU, yL, one = lip_edges(REF_SMILE, 0.0, t); d = np.abs(x) * HS / PX
    top = (ry_(prof(BEARD_LINES['chk_lip'], d)) + 0.0009 - oy) / HS
    thU = np.maximum(top - yU, 0.0012) * one ** 0.15
    lo = FACE_LINES['lip_lo']; bot = (ry_(prof(lo, d)) - oy) / HS
    thL = np.clip(yL - bot, 0, None) * sstep(lo[-1][0], lo[-2][0], d)
    return thU, thL

def lip_shape(smile, open_, t):
    """Lip outline (design units, relative to the mouth origin) across t in [-1, 1], corner to corner: x, upper lip bottom yU
    and thickness thU, lower lip top yL and thickness thL, and (1 - t^2). Shared by the lip meshes and the beard's opening.
    Linear in smile (>= 0) and in open_, so the smile / open morphs blend it exactly."""
    x, yU, yL, one = lip_edges(smile, open_, t); thU, thL = lip_thickness(t)
    return x, yU, yL, thU, thL, one

def mouth_field(P, kind, origin):
    """Skin / beard displacement that follows the lips (final units in, out): 'smile' lifts and widens the mouth corners,
    'frown' drops them, 'open' drops the jaw (the lower lip, chin and beard under the mouth) and lifts the upper lip a little."""
    S = HS; Q = P.copy()
    xr = P[:, 0] / S; yr = (P[:, 1] - origin[1]) / S; front = sstep(0.0, 0.045, P[:, 2] / S)
    W0 = F['lipW']
    if kind in ('smile', 'frown'):
        W1, cy = (W0 * (1 + MOUTH['smileW']), MOUTH['smileCurve']) if kind == 'smile' else (W0 * 0.96, -0.0038)
        u = np.minimum(np.abs(xr) / W1, 1.0)
        near = np.exp(-(yr / 0.016) ** 2) * np.exp(-(np.maximum(np.abs(xr) - W1, 0) / 0.018) ** 2) * front
        Q[:, 1] += cy * (corner_lift(u) if kind == 'smile' else u * u) * near * S      # as the lip line (lip_shape)
        Q[:, 0] += np.sign(xr) * (W1 - W0) * u * near * S
        if kind == 'smile':      # the smile parts the lips in the middle (lip_shape): the skin under the lower lip comes down with it
            gx = np.clip(1 - (np.abs(xr) / (MOUTH['openEdge'] * W1)) ** 2, 0, 1) ** 0.75
            below = sstep(0.0005, -0.003, yr) * np.exp(-(np.maximum(-(yr + 0.016), 0) / 0.008) ** 2)
            Q[:, 1] -= 0.95 * MOUTH['smileOpen'] * gx * below * front * S
    else:
        O = 0.0115
        below = sstep(0.001, -0.009, yr) * np.exp(-(xr / 0.06) ** 2) * front
        above = np.exp(-(np.maximum(yr, 0) / 0.007) ** 2) * (yr > 0) * np.exp(-(xr / 0.035) ** 2) * front
        Q[:, 1] += (-0.72 * O * below + 0.28 * O * above) * S
    d = np.abs(Q - P).max(1); Q[d < 1e-6] = P[d < 1e-6]      # exact zeros away from the mouth → sparse morphs
    return Q

def cheek_raise(P, amt):
    """Cheeks bunch up and forward (smile / squint). Final-scale head frame."""
    Q = P.copy()
    for s in (1, -1):
        g = gs(Q, (s * 0.050, -0.028, 0.085), (0.020, 0.017, 0.04)); g = np.where(g > 0.01, g, 0.0)   # exact zeros → sparse morph in the GLB
        Q[:, 1] += 0.0030 * amt * g; Q[:, 2] += 0.0018 * amt * g; Q[:, 0] += s * 0.0008 * amt * g
    return Q

class Builder:
    """The head in stages, so a live Blender session shows it being put together part by part.
    Headless: Builder().all(). Live (tools/blender/live.mjs): one stage per command, the viewport redraws in between."""
    STAGES = ('skull', 'eyes', 'ears', 'brows', 'hair', 'beard', 'lips', 'glasses', 'skin_detail')

    def all(self):
        for st in self.STAGES: getattr(self, st)()
        return self.skin

    def _bvh(self):
        bm = bmesh.new(); bm.from_mesh(self.skin.data); self.bvh = BVHTree.FromBMesh(bm); bm.free()

    def surface_z(self, x, y):
        hit = self.bvh.ray_cast(Vector((x, -0.6, y)), Vector((0, 1, 0)))
        return -hit[0].y if hit[0] is not None else 0.0

    def skull(self):
        """Bare skull: sculpted cube-sphere, dense on the face and denser around the eyes."""
        D, self.faces = cube_sphere(CUBE_CUTS, refine=[((0, 0.0, 1.0), 0.62, 1)] + [((s * 0.39, 0.10, 0.91), 0.26, 1) for s in (1, -1)])
        self.P0, self.Pd, self._moved = skull_points(D, F); self.P = self.P0; self.mouth_origin = None
        self.skin = make_object('skin', self.P0, self.faces, spherical_uv(self.P0)); self._bvh()
        col = self.skin.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')   # neutral until skin_detail paints it
        col.data.foreach_set('color', np.ones(len(self.P0) * 4, dtype=np.float32)); self.skin.data.color_attributes.active_color = col
        log('skin verts', len(self.P0), 'faces', len(self.faces))

    def eyes(self):
        """Eyeballs set into the sockets; the lids are carved into the skin around them."""
        self.centres = []
        for s in (1, -1):
            ex, ey = s * F['eyeX'] * HS, F['eyeY'] * HS + EYE['dy']; nat = self.surface_z(ex, ey)
            self.centres.append((ex, ey, nat + EYE['protrude'] - EYE['R'], nat))
        self.P, self.lid_shade = carve_lids(self.P0, self.centres)
        self.skin.data.vertices.foreach_set('co', to_bl(self.P).ravel()); self.skin.data.update(); self._bvh()
        tex = eye_material()
        for (ex, ey, ez, _), nm in zip(self.centres, ('eye_L', 'eye_R')): eyeball(nm, (ex, ey, ez), EYE['R'], tex)
        log('eye centres', [tuple(round(v, 5) for v in c[:3]) for c in self.centres])

    def ears(self):
        for s in (1, -1): ear_mesh(s, EAR)

    def brows(self): brows(self.surface_z)

    def _mouth(self):
        """Mouth origin (final units, just in front of the skin at mouthY); the lips, teeth and interior are laid out from it."""
        if getattr(self, 'mouth_origin', None) is None:
            S = HS; MYw = warp_face(np.array([[0.0, F['mouthY'], 0.09]]), F)[0, 1]
            oy = MYw * S; z0 = self.surface_z(0.0, oy); oz = z0 + 0.0006 * S
            self.mouth_origin = np.array([0.0, oy, oz])
        return self.mouth_origin

    def hair(self):
        """Hair and beard masks, then the hair shell. The beard's reference lines are traced on the smiling sheet, so they are
        matched on the skin as the smile morph moves it (REF_SMILE), against the upper lip's top edge at that smile."""
        o = self._mouth(); P = self.P
        Ps = P + REF_SMILE * (mouth_field(cheek_raise(P, 1.0), 'smile', o) - P)
        x, yU, _, thU, _, _ = lip_shape(REF_SMILE, 0.0, np.linspace(0.0, 1.0, 25))
        lip_top = list(zip(x * HS + o[0], (yU + thU) * HS + o[1] - 0.0009))     # the moustache overlaps the lip's flat top edge
        mk = masks(P, Ps, lip_top)
        self.hair_m, self.beard_m, self._z_lu, self._y_mn, self._stub, self._mst = mk['hair'], mk['beard'], mk['z_lineup'], mk['y_min'], mk['stub'], mk['full']
        self._fade, self._btaper = mk['fade'], mk['btaper']
        log('mouth origin y %.4f (front px %.1f), corner d %.1f px at smile %.2f' % (o[1], 378 - (o[1] - 0.014) / PX, x[-1] * HS / PX, REF_SMILE))
        yf, zf = self.P[:, 1], self.P[:, 2]
        temple_thin = mix(0.55, 1.0, sstep(self._z_lu, self._z_lu - 0.015, zf) + sstep(0.088, 0.098, yf))
        nape_thin = mix(0.55, 1.0, sstep(self._y_mn, self._y_mn + 0.014, yf))
        front_taper = mix(0.55, 1.0, sstep(0.112, 0.075, zf))
        # graded cut: longest on top, shorter down the sides and back, thinning out where the fade takes over (mk['taper'])
        fade_k = np.clip(temple_thin, 0.55, 1.0) * np.clip(nape_thin, 0.55, 1.0) * front_taper * mix(0.45, 1.0, mk['taper'])
        t = (0.0012 + 0.0050 * sstep(0.025, 0.085, self.Pd[:, 1])) * mix(1.0, 0.82, sstep(-0.01, -0.07, self.Pd[:, 2])) * fade_k * HS
        # less grain where the shell thins into the fade, so its edge stays a clean line on the painted stubble
        self.hair_shell = shell('hair', self.skin, self.P, self.Pd, self.hair_m, t, 0.14 * mix(0.1, 1.0, mk['taper']), 1)

    def beard(self):
        """Sleek close-trimmed beard following the sculpted chin and jawline."""
        x, y, z = self.Pd[:, 0], self.Pd[:, 1], self.Pd[:, 2]
        t = (BEARD['t'] + BEARD['chin'] * sstep(-0.060, -0.092, y) * sstep(-0.01, 0.05, z)
             + BEARD['jaw'] * sstep(-0.052, -0.084, y) * sstep(0.015, 0.045, np.abs(x))
             + BEARD['corner'] * sstep(-0.072, -0.096, y) * sstep(0.008, 0.030, np.abs(x)) * sstep(-0.01, 0.04, z)
             + BEARD['mst'] * self._mst) * HS * mix(0.3, 1.0, self._btaper)   # the moustache stands a little fuller than the cheek beard
        self.beard_shell = shell('beard', self.skin, self.P, self.Pd, self.beard_m, t, 0.16 * mix(0.15, 1.0, self._btaper), 2)

    def glasses(self):
        eye_front_z = max(c[2] for c in self.centres) + EYE['R'] if getattr(self, 'centres', None) else 0.100
        ear = bpy.data.objects.get('ear_L'); ear_top = None
        if ear is not None:
            co = np.zeros(len(ear.data.vertices) * 3); ear.data.vertices.foreach_get('co', co)
            ear_top = float(from_bl(co.reshape(-1, 3) + np.array(ear.location))[:, 1].max())
        glasses(self.surface_z, eye_front_z, ear_top)

    def lips(self):
        """Upper / lower lip, teeth and mouth interior resting on the skin (port of HeroHead._setMouth, in final units),
        with shape keys smile, frown and open – the rig blends them for smiles and speech. Each key is laid on the skin as
        that key deforms it (skin_detail builds the same skin keys), so the lips still meet where the smile lifts the skin."""
        S = HS; origin = self._mouth(); oy, oz = origin[1], origin[2]
        NX, NT = 28, 10; M = MOUTH
        t = np.linspace(-1, 1, NX + 1)
        def surface(Pk):
            bvh = BVHTree.FromPolygons([tuple(v) for v in to_bl(Pk)], self.faces)
            def sz(x, y):
                hit = bvh.ray_cast(Vector((x, -0.6, y)), Vector((0, 1, 0))); return -hit[0].y if hit[0] is not None else 0.0
            return sz
        P = self.P
        skins = {'rest': self.surface_z, 'smile': surface(mouth_field(cheek_raise(P, 1.0), 'smile', origin)),
                 'frown': surface(mouth_field(P, 'frown', origin)), 'open': surface(mouth_field(P, 'open', origin))}
        def geo(smile, open_, key):
            sz = skins[key]
            def skin_dz(x, y): return np.array([sz(a, oy + b) - oz for a, b in zip(x, y)])
            x, yU, yL, thU, thL, one = lip_shape(smile, open_, t)
            def fill(yIn, yOut, bulge, innerTop, th):
                rows = []
                # bulge follows the lip's own thickness, so a lip thinning toward the corners also flattens there
                b = bulge * np.clip(th / max(th.max(), 1e-6), 0, 1) ** 0.7
                for j in range(NT + 1):
                    tau = j / NT; y = mix(yIn, yOut, tau)
                    ti = 1 - tau if innerTop else tau          # 0 at the inner edge (where the lips meet), 1 at the outer edge
                    base = skin_dz(x * S, y * S) / S
                    # rounded toward the mouth, the inner edge just tucking under (so the lips meet on the seam), and from
                    # mid-lip out a cos^2 that meets the skin at a tangent, the last bit just under it: no step at the edge
                    h = math.sin(math.pi * ti) ** 0.7 if ti <= 0.5 else math.cos(math.pi * (ti - 0.5)) ** 2
                    z = base + b * h - 0.0004 * (1 - ti) ** 2 - 0.00015 * sstep(0.8, 1.0, ti)
                    rows.append(np.stack([x, y, z], 1))
                return np.concatenate(rows)
            def flat(rows_y, zoff):          # a strip lying zoff in front of the skin (so it stays visible as the corners lift)
                return np.concatenate([np.stack([x, ry, skin_dz(x * S, ry * S) / S + zoff], 1) for ry in rows_y])
            # teeth: from just under the upper lip down to the lower lip, only where the lips part more than the seam
            th = M["teeth"]; s_full = M['seam'] * (1 - 0.6 * t * t); mid_ = 0.5 * (yU + yL); ul = np.abs(t) < 0.78
            tt_ = np.where(ul, yU - 0.5 * s_full, mid_); tb = np.where(ul, np.minimum(np.maximum(yU - th, yL + 0.5 * s_full), tt_), mid_)
            return {
                'lip_U': fill(yU, yU + thU, M['bulgeU'], False, thU),
                'lip_L': fill(yL - thL, yL, M['bulgeL'], True, thL),
                # interior: reaches a little past both lip edges, so the seam between the lips always shows it
                'mouth': flat([mix(yL - 0.0003, yU + 0.0003, f) for f in np.linspace(0, 1, 5)], 0.00035),
                'teeth': flat((tb, mix(tb, tt_, 0.55), tt_), 0.0007),
            }
        def grid(nr):
            return [[j * (NX + 1) + i, j * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i] for j in range(nr) for i in range(NX)]
        rest, keys = geo(0, 0, 'rest'), {'smile': geo(1, 0, 'smile'), 'frown': geo(-1, 0, 'frown'), 'open': geo(0, 1, 'open')}
        # colour gradients (vertex colour, a multiplier on the rig's material): the teeth darken toward the corners and under the
        # upper lip, the interior is darkest at the corners. The lips' colours are LIP_TINT on the skin's own colour (the rig
        # gives them the skin material): full in the lip, fading to plain skin at the outer edge and the corners, so the lips
        # blend into the face, and darker along the inner edge where they meet
        at = np.abs(t); side = sstep(0.12, 0.46, at)
        def lip_rgb(tint, inner_dark, upper):
            ratio = np.array(srgb_to_lin(tint)) / np.array(srgb_to_lin(0x855237)); rows = []
            for j in range(NT + 1):
                ti = j / NT if upper else 1 - j / NT
                w = sstep(1.0, 0.45, ti) * sstep(1.0, 0.7, at)                 # lip colour weight
                dark = (1 - inner_dark * math.exp(-(ti / 0.16) ** 2)) * (1 - 0.15 * sstep(0.5, 1.0, at))
                rows.append((1 + (ratio[None] - 1) * w[:, None]) * mix(1.0, dark, w)[:, None])
            return np.concatenate(rows) / LIP_GAIN
        colours = {
            'teeth': np.concatenate([(0.80 - 0.55 * side), (1.0 - 0.62 * side), (0.42 - 0.25 * side)]),
            'mouth': np.tile(0.30 + 0.70 * (1 - sstep(0.08, 0.55, at)), 5),
            'lip_U': lip_rgb(LIP_TINT['upper'], 0.55, True),
            'lip_L': lip_rgb(LIP_TINT['lower'], 0.50, False),
        }
        for name, V in rest.items():
            nrows = {'lip_U': NT, 'lip_L': NT, 'teeth': 2, 'mouth': 4}[name]
            ob = make_object(name, V * S + origin, grid(nrows))
            set_colours(ob, colours[name])
            if name.startswith('lip'): ob['lipGain'] = LIP_GAIN          # glTF extras -> three.js userData.lipGain
            ob.shape_key_add(name='Basis', from_mix=False)
            for kn, G in keys.items():
                kb = ob.shape_key_add(name=kn, from_mix=False); kb.data.foreach_set('co', to_bl(G[name] * S + origin).ravel()); kb.value = 0.0

    def skin_detail(self):
        """Vertex colour (a multiplier on the skin tone with soft barber-fade gradients) and expression shape keys."""
        P, Pd = self.P, self.Pd
        xf, yf, zf = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(xf)
        sh = (self.lid_shade
              * (1 - 0.54 * sstep(0.0, 0.60, self.beard_m))
              * (1 - 0.44 * sstep(0.0, 0.60, self.hair_m))
              * (1 - 0.36 * self._stub))
        # graded fade (masks: HAIR_FADE): the skin under the thinning hair is painted from skin to the hair's colour, linearly
        # in sRGB as the sheet's gradient runs, with a fine per-vertex grain strongest mid-fade (short stubble, not a flat tint)
        D = self._fade; jit = np.random.RandomState(7).rand(len(P))
        # none where the mesh is stretched (long edges low on the head, or moved by blend_neck): per-vertex grain streaks there
        E = np.array([(f[i], f[(i + 1) % len(f)]) for f in self.faces for i in range(len(f))]); edge = np.zeros(len(P))
        L = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1); np.maximum.at(edge, E[:, 0], L); np.maximum.at(edge, E[:, 1], L)
        grain = 0.55 * (1 - sstep(0.002, 0.008, self._moved)) * (1 - sstep(0.0022, 0.0034, edge))
        D = np.clip(D + grain * (jit - 0.5) * 4 * D * (1 - D), 0, 1)
        def lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
        s_skin, s_hair = np.array([0x85, 0x52, 0x37]) / 255, np.array([0x16, 0x14, 0x14]) / 255
        fade_rgb = lin(s_skin[None] * (1 - D[:, None]) + s_hair[None] * D[:, None]) / lin(s_skin)[None]
        for c in self.centres: sh *= 1 - 0.08 * gs(P, (c[0], c[1] + 0.002, c[3]), (0.022, 0.015, 0.03))
        for s in (1, -1): sh *= 1 - 0.52 * gs(Pd, (s * 0.0074 * F['noseW'], -0.040 + F['noseY'], 0.105), (0.0038, 0.0025, 0.02))
        warm = gs(Pd, (0, -0.02, 0.1), (0.05, 0.03, 0.05))
        # skin around the lips takes on the lip colour (blends into the rig's lip meshes)
        lip = 0.45 * gs(Pd, (0, F['mouthY'], 0.1), (0.025, 0.0085, 0.03)); ratio = np.array(srgb_to_lin(0x7b4336)) / np.array(srgb_to_lin(0x855237))
        tint = [1 + (ratio[i] - 1) * lip for i in range(3)]
        rgba = np.stack([sh * (1 + 0.05 * warm) * tint[0] * fade_rgb[:, 0], sh * (1 - 0.02 * warm) * tint[1] * fade_rgb[:, 1],
                         sh * tint[2] * fade_rgb[:, 2], np.ones(len(sh))], 1).astype(np.float32)
        me = self.skin.data
        col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col.data.foreach_set('color', rgba.ravel()); me.color_attributes.active_color = col
        P0, C = self.P0, self.centres
        keys = {
            'blinkL': carve_lids(P0, C, shut=(True, False))[0],
            'blinkR': carve_lids(P0, C, shut=(False, True))[0],
            'squint': cheek_raise(carve_lids(P0, C, ku=(0.40, 0.40), kl=(0.93, 0.93))[0], 0.5),
            # the skin and the beard follow the lips: smile lifts the corners (and the cheeks), open drops the jaw
            'smile': mouth_field(cheek_raise(P, 1.0), 'smile', self.mouth_origin),
            'frown': mouth_field(P, 'frown', self.mouth_origin),
            'open': mouth_field(P, 'open', self.mouth_origin),
        }
        def put(ob, name, co):
            if not ob.data.shape_keys: ob.shape_key_add(name='Basis', from_mix=False)
            kb = ob.data.shape_keys.key_blocks.get(name) or ob.shape_key_add(name=name, from_mix=False)
            kb.data.foreach_set('co', to_bl(co).ravel()); kb.value = 0.0
        for name, Pk in keys.items(): put(self.skin, name, Pk)
        bob, keep, offs = self.beard_shell
        for name in ('smile', 'frown', 'open'): put(bob, name, keys[name][keep] + offs)
        log('hair faces', len(bpy.data.objects['hair'].data.polygons), 'beard faces', len(bpy.data.objects['beard'].data.polygons))

LAST = None          # the last headless Builder (measure() reads its masks)

def build():
    global LAST
    bpy.ops.wm.read_factory_settings(use_empty=True)
    LAST = Builder(); return LAST.all()

def export_glb(path):
    """Curves → meshes, one placeholder material per part (the rig assigns its own materials by node name), GLB out.
    Only the head's collection is exported (a live session may hold other objects)."""
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in [o for o in coll().objects if o.type == 'CURVE']:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); name = ob.name
        bpy.data.objects.remove(ob); new = bpy.data.objects.new(name, me); coll().objects.link(new)
        for p in me.polygons: p.use_smooth = True
    for ob in coll().objects:
        if ob.type != 'MESH': continue
        role = ob.name.split('_')[0]
        m = bpy.data.materials.get(role) or bpy.data.materials.new(role)
        ob.data.materials.clear(); ob.data.materials.append(m)
    for ob in bpy.context.scene.objects: ob.select_set(ob.name in coll().objects)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    opts = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_morph=True, export_morph_normal=False,
                export_cameras=False, export_lights=False, export_texcoords=True, export_normals=True, export_materials='PLACEHOLDER',
                export_extras=True)           # custom properties (the lips' lipGain) -> node extras -> three.js userData
    # EXT_meshopt_compression: several times smaller; the rig's GLTFLoader has MeshoptDecoder set (HeadModels.js)
    if 'export_meshopt_compression_enable' in bpy.ops.export_scene.gltf.get_rna_type().properties.keys():
        opts['export_meshopt_compression_enable'] = True
    try:
        bpy.ops.export_scene.gltf(**opts, export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)
    except TypeError as e:
        log('vertex colour option not supported, retrying without it:', e); bpy.ops.export_scene.gltf(**opts)
    for ob in bpy.context.scene.objects: ob.select_set(False)          # leave a live viewport unselected
    log('glb', path, os.path.getsize(path), 'bytes')

# --------------------------------------------------------------------------- live session helpers (run inside an open Blender)
def live_reset():
    """Remove what an earlier live run built (only this builder's collections), keep the rest of the user's scene."""
    for name in (COLL, COLL + 'Ref'):
        c = bpy.data.collections.get(name)
        if c:
            for ob in list(c.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.users == 0]: bpy.data.meshes.remove(me)

def live_reference(img_path):
    """The reference face as a half-transparent image behind the head, sized and placed in head-frame metres."""
    c = coll(COLL + 'Ref')
    ob = bpy.data.objects.new('reference', None); ob.empty_display_type = 'IMAGE'; c.objects.link(ob)
    ob.data = bpy.data.images.load(img_path, check_existing=True)
    ob.empty_display_size = 840 * PX                                     # the image's longer side (840 px) in metres
    ob.empty_image_offset = (-0.5, -0.5)
    ob.location = ((400 - 392) * PX, 0.16, 0.014 + (378 - 420) * PX)     # behind the head (Blender +y), crop centre
    ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.color[3] = 0.55; ob.use_empty_image_alpha = True
    ob.show_empty_image_only_axis_aligned = True; ob.empty_image_side = 'FRONT'
    return ob

def live_view(front=True, shading='MATERIAL'):
    """Frame the head in the 3D viewport (front orthographic) with material preview shading."""
    wm = bpy.context.window_manager
    for win in wm.windows:
        for area in win.screen.areas:
            if area.type != 'VIEW_3D': continue
            region = next(r for r in area.regions if r.type == 'WINDOW'); space = area.spaces.active
            space.shading.type = shading
            r3d = space.region_3d
            if front:
                with bpy.context.temp_override(window=win, area=area, region=region):
                    bpy.ops.view3d.view_axis(type='FRONT')
            r3d.view_location = Vector(((400 - 392) * PX, 0, 0.014 + (378 - 420) * PX)); r3d.view_distance = 0.42
            area.tag_redraw()
            return True
    return False

# --------------------------------------------------------------------------- preview materials + render
def srgb_to_lin(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c]

def mat(name, color, rough=0.5, sss=0.0, metal=0.0):
    if bpy.data.materials.get(name): return bpy.data.materials[name]      # live sessions call this repeatedly
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*srgb_to_lin(color), 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if sss and 'Subsurface Weight' in b.inputs: b.inputs['Subsurface Weight'].default_value = sss
    return m

def live_turnaround_refs(sheet_path):
    """Place the Front, Left Profile, and Back turnaround references behind/underneath the head in exact metres,
    aligned on crown height and nose/eye datum so axis-aligned views (Numpad 1 / 3 / Ctrl+1) match 1:1."""
    c = coll(COLL + 'Ref')
    im = bpy.data.images.load(sheet_path, check_existing=False); w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    specs = [
        # (name, crop box x0,y0,x1,y1, head_h_px, top_px, loc_blender, rot_euler)
        ('ref_front', (0, 640, 245, 918), 202, 9, (0.0056, 0.16, 0.0), (math.pi / 2, 0, 0)),
        ('ref_side', (500, 640, 720, 918), 202, 12, (-0.16, -0.022, 0.0), (math.pi / 2, 0, math.pi / 2)),
        ('ref_back', (720, 640, 935, 918), 202, 11, (-0.0216, -0.16, 0.0), (math.pi / 2, 0, math.pi)),
    ]
    HEAD_H = 0.248; CROWN_Z = 0.1375
    for nm, (x0, y0, x1, y1), hh_px, top_px, loc, rot in specs:
        crop = px[y0:y1, x0:x1]
        cw, ch = x1 - x0, y1 - y0
        p_out = os.path.join(OUT, f'clean_turn_{nm[4:]}.png')
        img = bpy.data.images.new(nm, cw, ch); img.pixels = crop[::-1].reshape(-1).tolist()
        img.filepath_raw = p_out; img.file_format = 'PNG'; img.save()
        scale_m = HEAD_H / hh_px
        ob = bpy.data.objects.new(nm, None); ob.empty_display_type = 'IMAGE'; c.objects.link(ob)
        ob.data = bpy.data.images.load(p_out, check_existing=False)
        ob.empty_display_size = max(cw, ch) * scale_m
        ob.empty_image_offset = (-0.5, -0.5)
        cz = CROWN_Z - (ch * 0.5 - top_px) * scale_m + loc[2]
        ob.location = (loc[0], loc[1], cz)
        ob.rotation_euler = rot
        ob.color[3] = 0.55; ob.use_empty_image_alpha = True
        ob.show_empty_image_only_axis_aligned = True; ob.empty_image_side = 'FRONT'

def eye_material():
    W, H = 512, 256; img = bpy.data.images.new('eye_tex', W, H)
    j, i = np.mgrid[0:H, 0:W]; v = (j + 0.5) / H; u = (i + 0.5) / W; phi = (1 - v) * math.pi; th = u * 2 * math.pi
    R_I = IRIS[0] * math.pi; col = np.zeros((H, W, 4), dtype=np.float32); col[..., 3] = 1
    sclera = np.array([0.92, 0.90, 0.88]); iris = np.array(srgb_to_lin(0x47210e)); fibre = 0.65 + 0.35 * np.sin(th * 48) * 0.5 + 0.1 * np.sin(th * 17)
    col[..., :3] = sclera
    inside = phi < R_I
    ic = iris[None, None, :] * (0.55 + 0.9 * (phi / R_I))[..., None] * fibre[..., None]
    col[..., :3] = np.where(inside[..., None], ic, col[..., :3])
    ring = (phi > R_I * 0.80) & inside; col[..., :3] = np.where(ring[..., None], col[..., :3] * 0.30, col[..., :3])
    pup = phi < (IRIS[1] * math.pi); col[..., :3] = np.where(pup[..., None], 0.005, col[..., :3])
    img.pixels = col.reshape(-1).tolist()
    m = bpy.data.materials.new('eye'); m.use_nodes = True; nt = m.node_tree
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.12; nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
    return m

def preview_materials():
    skin_m = mat('pv_skin', 0x855237, 0.5, 0.15); dark = mat('pv_hair', 0x151313, 0.65); brow_m = mat('pv_brow', 0x1c1410, 0.7)
    frame_m = mat('pv_frame', 0x2c2928, 0.45); ear_m = mat('pv_ear', 0x855237, 0.5); lens_m = mat('pv_lens', 0xffffff, 0.05)
    lb = lens_m.node_tree.nodes['Principled BSDF']; lb.inputs['Alpha'].default_value = 0.06
    if 'Specular IOR Level' in lb.inputs: lb.inputs['Specular IOR Level'].default_value = 0.08
    if hasattr(lens_m, 'surface_render_method'): lens_m.surface_render_method = 'BLENDED'   # no dithering noise in the viewport
    lip_m = mat('pv_lips', 0x855237, 0.45); teeth_m = mat('pv_teeth', 0xece6da, 0.3); inner_m = mat('pv_mouth', 0x2a0d0b, 0.9)
    for m_, hx in ((skin_m, 0x855237), (lip_m, 0x855237), (teeth_m, 0xece6da), (inner_m, 0x2a0d0b)):   # base x vertex colour (the lips: skin x lip tint)
        nt = m_.node_tree
        if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
        g = LIP_GAIN if m_ is lip_m else 1.0
        mul.inputs['A'].default_value = (*[min(1.0, c * g) for c in srgb_to_lin(hx)], 1)
        nt.links.new(vc.outputs['Color'], mul.inputs['B']); nt.links.new(mul.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    roles = {'skin': skin_m, 'hair': dark, 'beard': dark, 'brow': brow_m, 'rim': frame_m, 'frame': frame_m, 'lens': lens_m, 'ear': ear_m,
             'lip': lip_m, 'teeth': teeth_m, 'mouth': inner_m}
    for ob in coll().objects:
        role = ob.name.split('_')[0]
        if ob.type in ('MESH', 'CURVE') and role != 'eye':
            ob.data.materials.clear(); ob.data.materials.append(roles.get(role, ear_m))
        if role == 'eye' and not ob.data.materials: ob.data.materials.append(bpy.data.materials.get('eye') or eye_material())

def setup_scene(w=800, h=840):
    sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(arg('--samples', 40)); sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
    sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    if not bpy.data.worlds.get('w'):
        w_ = bpy.data.worlds.new('w'); w_.use_nodes = True; w_.node_tree.nodes['Background'].inputs['Color'].default_value = (0.7, 0.7, 0.72, 1)
        w_.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8; sc.world = w_
    for name, loc, e in (('key', (-0.5, -0.8, 0.5), 60), ('fill', (0.6, -0.7, 0.1), 25)):
        if bpy.data.objects.get(name): continue
        L = bpy.data.lights.new(name, 'AREA'); L.energy = e; L.size = 0.6
        o = bpy.data.objects.new(name, L); o.location = loc; bpy.context.scene.collection.objects.link(o)
        c = o.constraints.new('TRACK_TO'); c.target = bpy.data.objects.get('eye_L'); c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

def camera(name, loc, rot, ortho=None, lens=85):
    cam = bpy.data.cameras.new(name); o = bpy.data.objects.new(name, cam); bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    if ortho: cam.type = 'ORTHO'; cam.ortho_scale = ortho
    else: cam.lens = lens
    return o

def render_views(names=('front', 'q34')):
    setup_scene(); preview_materials()
    cx, cy = (400 - 392) * PX, 0.014 + (378 - 420) * PX
    views = {
        'front': camera('cam_front', (cx, -1.0, cy), (math.pi / 2, 0, 0), ortho=840 * PX),
        'side': camera('cam_side', (1.0, 0.0, cy), (math.pi / 2, 0, math.pi / 2), ortho=840 * PX),
        'back': camera('cam_back', (cx, 1.0, cy), (math.pi / 2, 0, math.pi), ortho=840 * PX),
        'q34': camera('cam_q34', (-0.42, -0.72, 0.03), (math.pi / 2, 0, -0.52), lens=100),
    }
    for name in names:
        bpy.context.scene.camera = views[name]
        bpy.context.scene.render.filepath = os.path.join(OUT, f'{name}.png')
        bpy.ops.render.render(write_still=True); log('rendered', name)

def overlay(ref_path, render_path, out_path, alpha=0.6):
    ref = bpy.data.images.load(ref_path); ren = bpy.data.images.load(render_path)
    w, h = ref.size
    a = np.array(ref.pixels[:], dtype=np.float32).reshape(h, w, 4); b = np.array(ren.pixels[:], dtype=np.float32).reshape(h, w, 4)
    k = b[..., 3:4] * alpha
    o = a.copy(); o[..., :3] = a[..., :3] * (1 - k) + b[..., :3] * k; o[..., 3] = 1
    out = bpy.data.images.new('overlay', w, h); out.pixels = o.reshape(-1).tolist(); out.filepath_raw = out_path; out.file_format = 'PNG'; out.save()

def diff_overlay(ref_path, render_path, out_prefix):
    """Differences you can see: <out>-blend.png (reference at 50 % over the model) and <out>-edges.png (the model with
    the reference's feature edges in red and the model's own edges in cyan). Same framing as the reference crop."""
    def load(p):
        im = bpy.data.images.load(p, check_existing=False); w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    ref = load(ref_path); ren = load(render_path)
    bgc = np.median(np.concatenate([ref[:30, :30, :3].reshape(-1, 3), ref[:30, -30:, :3].reshape(-1, 3)]), 0)
    a = ren[..., 3:4]; mod = ren[..., :3] * a + bgc * (1 - a)                   # model over the reference's grey
    def edges(img, pct):
        L = img[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        gx = np.zeros_like(L); gy = np.zeros_like(L)
        gx[:, 1:-1] = L[:, 2:] - L[:, :-2]; gy[1:-1] = L[2:] - L[:-2]
        g = np.hypot(gx, gy); return g > np.percentile(g, pct)
    er, em = edges(ref, 91), edges(np.concatenate([mod, np.ones_like(a)], -1), 91)
    def save(arr, path):
        out = np.concatenate([arr, np.ones(arr.shape[:2] + (1,), np.float32)], -1)
        im = bpy.data.images.new('d', out.shape[1], out.shape[0]); im.pixels = out[::-1].reshape(-1).tolist()
        im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    save(mod * 0.5 + ref[..., :3] * 0.5, out_prefix + '-blend.png')
    e = mod * 0.75 + 0.25; e[em] = (0.0, 0.75, 0.9); e[er] = (0.95, 0.05, 0.05)
    save(e, out_prefix + '-edges.png')
    # hair / beard / moustache: dark regions of both, compared. red = only in the reference (missing on the model),
    # cyan = only on the model (too much), grey = both. Rows below: dark runs (x from..to) in each, for the hair/beard band.
    def dark(img, k):
        # luminance relative to the forehead skin (the two images are lit differently), box-blurred over the hair grain
        L = img[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        c = np.pad(L, 3, mode='edge').cumsum(0).cumsum(1); c = np.pad(c, ((1, 0), (1, 0)))
        B = (c[7:, 7:] - c[:-7, 7:] - c[7:, :-7] + c[:-7, :-7]) / 49.0
        skin = np.median(L[230:260, 370:415])
        d = B < k * skin; d[:, :150] = False; d[:, 650:] = False
        return d
    k = float(arg('--dark', 0.5))
    dr, dm = dark(ref, k), dark(np.concatenate([mod, np.ones_like(a)], -1), k)
    g = ref[..., :3] * 0.35 + 0.55
    g[dr & dm] = (0.25, 0.25, 0.25); g[dr & ~dm] = (0.95, 0.1, 0.1); g[dm & ~dr] = (0.0, 0.7, 0.9)
    save(g, out_prefix + '-dark.png')
    def runs(row):
        r, x = [], 0
        while x < len(row):
            if row[x]:
                s = x
                while x < len(row) and row[x]: x += 1
                if x - s >= 6: r.append((s, x - 1))
            x += 1
        return r
    for y in list(range(70, 200, 10)) + list(range(470, 730, 10)):
        log(f'  dark y={y}: ref {runs(dr[y])}  model {runs(dm[y])}')
    log('  dark pixels: ref only', int((dr & ~dm).sum()), 'model only', int((dm & ~dr).sum()), 'both', int((dr & dm).sum()))

def measure_side(sheet_path, box=(500, 640, 720, 900), eye=(539.3, 751.7)):
    """Left profile of the model vs the 'Left Profile' panel of pharmacist-turnaround.webp (box = panel crop in sheet px,
    eye = front of the eye in sheet px). The panel is scaled so its head height (hair top → beard bottom) equals the
    model's and placed so the eyes line up. Writes side-blend.png and side-lines.png (reference outline red, model cyan)
    and logs the front (face) and back (skull) profile difference per row in mm."""
    render_views(('side',))                 # Cycles with the preview materials: hair and beard read dark
    path = os.path.join(OUT, 'side.png')
    def load(p):
        im = bpy.data.images.load(p, check_existing=False); w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    ren = load(path); mm = ren[..., 3] > 0.5
    sheet = load(sheet_path); x0, y0, x1, y1 = box; crop = sheet[y0:y1, x0:x1, :3]
    bg = np.median(crop[:12, -40:].reshape(-1, 3), 0)
    L = crop @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    rm_c = np.linalg.norm(crop - bg, axis=-1) > 0.10
    darkrows = np.where((L < 0.25).sum(1) > 3)[0]
    top_r = int(np.where(rm_c.sum(1) > 2)[0].min()); bot_r = int(darkrows.max())          # hair top, beard bottom (crop px)
    rows_m = np.where(mm.sum(1) > 2)[0]; top_m, bot_m = int(rows_m.min()), int(rows_m.max())
    s = (bot_m - top_m) / (bot_r - top_r)
    ez = LAST.centres[0][2] + EYE['R']; eye_m = 400 - ez / PX                                # model eye front (px)
    ex, ey = eye[0] - x0, eye[1] - y0
    # resample the panel into the model frame
    H, W = mm.shape; yy, xx = np.mgrid[0:H, 0:W]
    sx = ((xx - eye_m) / s + ex).round().astype(int); sy = ((yy - top_m) / s + top_r).round().astype(int)
    ok = (sx >= 0) & (sx < crop.shape[1]) & (sy >= 0) & (sy < crop.shape[0])
    refimg = np.ones((H, W, 3), np.float32) * bg; refimg[ok] = crop[sy[ok], sx[ok]]
    rm = np.zeros((H, W), bool); rm[ok] = rm_c[sy[ok], sx[ok]]; rm[bot_m + 3:] = False      # head only (no neck / collar)
    mod = ren[..., :3] * ren[..., 3:4] + bg * (1 - ren[..., 3:4])
    def edge(m):
        e = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1); e = m & ~e
        return e | np.roll(e, 1, 1) | np.roll(e, 1, 0)
    def save(arr, name):
        out = np.concatenate([arr, np.ones(arr.shape[:2] + (1,), np.float32)], -1)
        im = bpy.data.images.new('s', W, H); im.pixels = out[::-1].reshape(-1).tolist()
        im.filepath_raw = os.path.join(OUT, name); im.file_format = 'PNG'; im.save()
    save(mod * 0.5 + refimg * 0.5, 'side-blend.png')
    o = refimg * 0.6 + mod * 0.4; o[edge(mm)] = (0.0, 0.75, 0.9); o[edge(rm)] = (0.95, 0.05, 0.05); save(o, 'side-lines.png')
    def darkm(img, head):
        Lm = img @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        c = np.pad(Lm, 3, mode='edge').cumsum(0).cumsum(1); c = np.pad(c, ((1, 0), (1, 0)))
        B = (c[7:, 7:] - c[:-7, 7:] - c[7:, :-7] + c[:-7, :-7]) / 49.0
        skin = np.percentile(Lm[head], 80); return (B < 0.5 * skin) & head
    dr, dmm = darkm(refimg, rm), darkm(mod, mm)
    g = refimg * 0.35 + 0.55; g[dr & dmm] = (0.25, 0.25, 0.25); g[dr & ~dmm] = (0.95, 0.1, 0.1); g[dmm & ~dr] = (0.0, 0.7, 0.9)
    if LAST is not None:   # our visible hair edge (green) and beard edge (yellow) on the left side
        for msk, colr in ((LAST.hair_m, (0.1, 1.0, 0.2)), (LAST.beard_m, (1.0, 0.9, 0.1))):
            sel = (msk > 0.015) & (msk < 0.04) & (LAST.P[:, 0] > 0.01)
            xs = np.clip((400 - LAST.P[sel, 2] / PX).astype(int), 1, W - 2); ys = np.clip((378 - (LAST.P[sel, 1] - 0.014) / PX).astype(int), 1, H - 2)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1): g[ys + dy, xs + dx] = colr
    save(g, 'side-dark.png')
    def runs(row):
        r, x = [], 0
        while x < len(row):
            if row[x]:
                s0 = x
                while x < len(row) and row[x]: x += 1
                if x - s0 >= 5: r.append((s0, x - 1))
            x += 1
        return r
    for y in range(top_m + 20, bot_m, 25):
        log(f'  side dark y={y} ({(y - top_m) / (bot_m - top_m):4.2f}): ref {runs(dr[y])}  model {runs(dmm[y])}')
    log(f'side: panel scale {s:.2f}, model top {top_m} bottom {bot_m}; + = model further out than the reference (mm)')
    for y in range(top_m + 10, bot_m, 15):
        a, b = np.where(rm[y])[0], np.where(mm[y])[0]
        if len(a) and len(b):
            log(f'  y={y:3d} ({(y - top_m) / (bot_m - top_m):4.2f})  front {(a.min() - b.min()) * PX * 1000:+6.1f}   back {(b.max() - a.max()) * PX * 1000:+6.1f}')

def measure(ref_path):
    """Front silhouette of the model vs the reference crop, row by row (crop pixels; 1 px = PX m): left/right edges,
    widths, top of the hair and bottom of the beard. Also writes silhouette-overlay.png (our outline in red on the reference)."""
    sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = 800, 840
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'
    sc.camera = camera('cam_measure', ((400 - 392) * PX, -1.0, 0.014 + (378 - 420) * PX), (math.pi / 2, 0, 0), ortho=840 * PX)
    path = os.path.join(OUT, 'silhouette.png'); sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    def load(p):
        im = bpy.data.images.load(p, check_existing=False); w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    ref = load(ref_path); ren = load(path)
    bg = np.median(np.concatenate([ref[:30, :30, :3].reshape(-1, 3), ref[:30, -30:, :3].reshape(-1, 3)]), 0)
    rm = np.linalg.norm(ref[..., :3] - bg, axis=-1) > 0.07; mm = ren[..., 3] > 0.5
    lum = ref[..., :3].mean(-1)
    def ext(mask, y):
        xs = np.where(mask[y])[0]; return (int(xs.min()), int(xs.max())) if len(xs) else (-1, -1)
    def top(mask):
        r = np.where(mask[:, 250:550].sum(1) > 3)[0]; return int(r.min()) if len(r) else -1
    rb = np.where((lum < 0.12)[:, 330:470].sum(1) > 20)[0]; mb = np.where(mm[:, 330:470].sum(1) > 20)[0]
    log('measure: ref hair top', top(rm), 'model top', top(mm), '| ref beard bottom', int(rb.max()), 'model bottom', int(mb.max()))
    log('  y    ref L-R (w)        model L-R (w)     dw')
    for y in range(60, 740, 20):
        a, b = ext(rm, y), ext(mm, y)
        log(f'  {y:3d}  {a[0]:4d}-{a[1]:4d} ({a[1] - a[0]:4d})   {b[0]:4d}-{b[1]:4d} ({b[1] - b[0]:4d})   {(b[1] - b[0]) - (a[1] - a[0]):+5d}')
    e = mm & np.roll(mm, 1, 0) & np.roll(mm, -1, 0) & np.roll(mm, 1, 1) & np.roll(mm, -1, 1); edge = mm & ~e
    edge = edge | np.roll(edge, 1, 1) | np.roll(edge, 1, 0)
    o = ref.copy(); o[edge, :3] = (1.0, 0.05, 0.05); o[..., 3] = 1
    if LAST is not None:   # our visible hairline (where the hair shell leaves the skin, mask ~0.025) in green
        hm, P = LAST.hair_m, LAST.P; sel = (hm > 0.015) & (hm < 0.04) & (P[:, 2] > 0.02)
        xs = np.clip((392 + P[sel, 0] / PX).astype(int), 1, 798); ys = np.clip((378 - (P[sel, 1] - 0.014) / PX).astype(int), 1, 838)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1): o[ys + dy, xs + dx, :3] = (0.1, 1.0, 0.2)
        for y in range(150, 260, 10):
            xs_row = xs[np.abs(ys - y) <= 2]; xs_row = xs_row[np.abs(xs_row - 392) < 220]
            if len(xs_row): log(f'  hairline y={y}: model x {xs_row.min()}..{xs_row.max()}')
        c = sel & (np.abs(P[:, 0]) < 0.01)
        if c.any(): log('  hairline at the centre (crop y):', int(np.median(378 - (P[c, 1] - 0.014) / PX)))
    out = bpy.data.images.new('sil', o.shape[1], o.shape[0]); out.pixels = o[::-1].reshape(-1).tolist()
    out.filepath_raw = os.path.join(OUT, 'silhouette-overlay.png'); out.file_format = 'PNG'; out.save()

def measure_turnaround(sheet_path):
    """Exact 3-view reference-underlay check (Side, Front, Back) against pharmacist-turnaround.webp.
    Applies smile=0.55 to match the turnaround sheet, renders orthographic views, places the original reference
    directly underneath each view (scaled on head height, aligned on nose/centre), and writes fit-side.png,
    fit-front.png, fit-back.png, and fit-compare.jpg (plus row-by-row mm tables in log.txt)."""
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk and 'smile' in sk.key_blocks: sk.key_blocks['smile'].value = 0.55
    render_views(('side', 'front', 'back'))
    def load(p):
        im = bpy.data.images.load(p, check_existing=False); w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    def edge(m):
        e = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1); e = m & ~e
        return e | np.roll(e, 1, 1) | np.roll(e, 1, 0)
    def save_img(arr, name, fmt='PNG'):
        out = np.concatenate([np.clip(arr, 0, 1), np.ones(arr.shape[:2] + (1,), np.float32)], -1)
        im = bpy.data.images.new('fit', out.shape[1], out.shape[0]); im.pixels = out[::-1].reshape(-1).tolist()
        im.filepath_raw = os.path.join(OUT, name); im.file_format = fmt; im.save()
    sheet = load(sheet_path)
    # 1. Side (Left Profile), 2. Front Face, 3. Back Head
    panels = {
        'side':  (500, 640, 720, 918),
        'front': (0,   640, 245, 918),
        'back':  (720, 640, 935, 918),
    }
    rows_grid = []
    front_scale = None
    for view in ('front', 'side', 'back'):
        ren = load(os.path.join(OUT, f'{view}.png'))
        mm = ren[..., 3] > 0.5
        H, W = mm.shape
        x0, y0, x1, y1 = panels[view]; crop = sheet[y0:y1, x0:x1, :3]
        bg = np.median(crop[:12, -25:].reshape(-1, 3), 0)
        rm_c = np.linalg.norm(crop - bg, axis=-1) > 0.08
        L = crop @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        top_r = int(np.where(rm_c.sum(1) > 3)[0].min())
        rows_m = np.where(mm.sum(1) > 3)[0]; top_m, bot_m = int(rows_m.min()), int(rows_m.max())
        # Honest uniform scale locked to crown (top_r -> top_m) and eye datum (top_r + 100 -> row 378 = y +0.014)
        # across ALL 3 views so chin height, neck clearance, and head width are never artificially stretched!
        s = (378 - top_m) / 100.0
        if view == 'front':
            front_scale = s
            xr_mid = np.where(rm_c[top_r + 65])[0].mean()
            xm_mid = np.where(mm[top_m + int(65 * s)])[0].mean()
        elif view == 'side':
            # align horizontally on the nose tip (most protruding front pixel in mid-face)
            nr_slice = range(top_r + 105, top_r + 150)
            xr_mid = min(int(np.where(rm_c[y])[0].min()) for y in nr_slice)
            nm_slice = range(top_m + int(105 * s), top_m + int(150 * s))
            xm_mid = min(int(np.where(mm[y])[0].min()) for y in nm_slice)
        else:
            s = front_scale
            xr_mid = np.where(rm_c[top_r + 65])[0].mean()
            xm_mid = np.where(mm[top_m + int(65 * s)])[0].mean()
        yy, xx = np.mgrid[0:H, 0:W]
        sx = ((xx - xm_mid) / s + xr_mid).round().astype(int)
        sy = ((yy - top_m) / s + top_r).round().astype(int)
        ok = (sx >= 0) & (sx < crop.shape[1]) & (sy >= 0) & (sy < crop.shape[0])
        refimg = np.ones((H, W, 3), np.float32) * bg; refimg[ok] = crop[sy[ok], sx[ok]]
        rm = np.zeros((H, W), bool); rm[ok] = rm_c[sy[ok], sx[ok]]
        if view != 'back': rm[bot_m + 5:] = False
        mod = ren[..., :3] * ren[..., 3:4] + bg * (1 - ren[..., 3:4])
        ov = refimg * 0.55 + mod * 0.45
        ov[edge(mm)] = (0.0, 0.85, 1.0)
        ov[edge(rm)] = (1.0, 0.08, 0.08)
        save_img(ov, f'fit-{view}.png')
        # crop tight around the head (x=60..740, y=30..780) and scale to 360px height for grid
        def crop_sq(img):
            c = img[30:790, 60:740]
            yi = (np.arange(380) * c.shape[0] / 380).astype(int)
            xi = (np.arange(340) * c.shape[1] / 340).astype(int)
            return c[yi][:, xi]
        g_pad = np.ones((380, 6, 3), np.float32)
        rows_grid.append(np.concatenate([crop_sq(mod), g_pad, crop_sq(ov), g_pad, crop_sq(refimg)], 1))
        log(f'fit-{view}: scale={s:.2f}, top_m={top_m}, bot_m={bot_m}')
        for y in range(top_m + 15, min(bot_m, top_m + 660), 25):
            a, b = np.where(rm[y])[0], np.where(mm[y])[0]
            if len(a) and len(b):
                if view == 'side':
                    log(f'  side y={y:3d} ({(y-top_m)/(bot_m-top_m):.2f}): front {(a.min()-b.min())*PX*1000:+5.1f} mm, back {(b.max()-a.max())*PX*1000:+5.1f} mm')
                else:
                    log(f'  {view} y={y:3d}: dw {((b.max()-b.min())-(a.max()-a.min()))*PX*1000:+5.1f} mm (ref {(a.max()-a.min())*PX*1000:.0f}, mod {(b.max()-b.min())*PX*1000:.0f})')
    h_pad = np.ones((6, rows_grid[0].shape[1], 3), np.float32)
    grid = np.concatenate([rows_grid[1], h_pad, rows_grid[0], h_pad, rows_grid[2]], 0)  # Side, Front, Back
    save_img(grid, 'fit-compare.jpg', fmt='JPEG')
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk:
            for kb in sk.key_blocks: kb.value = 0.0

def beard_line_px():
    """BEARD_LINES as polylines in the model's render frames: {(view, name): [(u, v), ...]}, front lines across both sides."""
    out = {}
    for name, pts in BEARD_LINES.items():
        if name in ('mst', 'chk_lip'):          # centre → outward: drawn from the left end over the centre to the right end
            out[('front', name)] = [(392 - d, v) for d, v in pts[::-1]] + [(392 + d, v) for d, v in pts]
        elif name == 'shave':                   # corner → centre: left corner, under the mouth, right corner
            out[('front', name)] = [(392 - d, v) for d, v in pts] + [(392 + d, v) for d, v in pts[::-1]]
        elif name == 'chk_cheek_l': out[('front', name)] = [(392 - d, v) for d, v in pts]
        elif name == 'chk_cheek_r': out[('front', name)] = [(392 + d, v) for d, v in pts]
        else: out[('side', name)] = list(pts)
    return out

def beard_lines_check(sheet_path):
    """The facial-hair reference lines over the model at the sheet's smile (BEARD_LINES in red, check lines in orange): front
    and side renders next to the turnaround panels mapped into the same frame (as measure_turnaround() maps them), with the
    model's beard edge in cyan from an exact object-colour pass. Writes beard-lines-front.png, beard-lines-side.png and
    beard-lines.jpg (reference | model, front over side) and logs each line's distance to the beard edge in mm."""
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk and 'smile' in sk.key_blocks: sk.key_blocks['smile'].value = REF_SMILE
    render_views(('front', 'side'))
    sc = bpy.context.scene; engine = sc.render.engine; hidden = []
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'OBJECT'
    for ob in coll().objects:
        role = ob.name.split('_')[0]; ob.color = (1, 0, 0, 1) if role == 'beard' else (0.8, 0.8, 0.8, 1)
        if role in ('rim', 'frame', 'lens') and not ob.hide_render: ob.hide_render = True; hidden.append(ob)
    for view in ('front', 'side'):
        sc.camera = bpy.data.objects['cam_' + view]; sc.render.filepath = os.path.join(OUT, f'beard-mask-{view}.png')
        bpy.ops.render.render(write_still=True)
    for ob in hidden: ob.hide_render = False
    sc.render.engine = engine
    def load(p):
        im = bpy.data.images.load(p, check_existing=False); w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    def save_img(arr, name, fmt='PNG'):
        out = np.concatenate([np.clip(arr, 0, 1), np.ones(arr.shape[:2] + (1,), np.float32)], -1)
        im = bpy.data.images.new('bl', out.shape[1], out.shape[0]); im.pixels = out[::-1].reshape(-1).tolist()
        im.filepath_raw = os.path.join(OUT, name); im.file_format = fmt; im.save()
    def draw(img, pts, col):
        Q = np.asarray(pts, dtype=float)
        for (ax_, ay_), (bx_, by_) in zip(Q[:-1], Q[1:]):
            for t_ in np.linspace(0, 1, int(max(abs(bx_ - ax_), abs(by_ - ay_)) * 2) + 2):
                u, v = int(round(ax_ + (bx_ - ax_) * t_)), int(round(ay_ + (by_ - ay_) * t_))
                img[max(v - 1, 0):v + 1, max(u - 1, 0):u + 1] = col
    def dense(pts):
        Q = np.asarray(pts, dtype=float); seg = []
        for a, b in zip(Q[:-1], Q[1:]): seg.append(a + (b - a) * np.linspace(0, 1, int(np.abs(b - a).max()) + 1, endpoint=False)[:, None])
        return np.vstack(seg + [Q[-1:]])
    sheet = load(sheet_path); lines = beard_line_px(); panels = {'front': (0, 640, 245, 918), 'side': (500, 640, 720, 918)}
    crops = {'front': (150, 380, 650, 720), 'side': (30, 330, 530, 720)}; rows = []
    for view in ('front', 'side'):
        ren = load(os.path.join(OUT, f'{view}.png')); mm = ren[..., 3] > 0.5; H, W = mm.shape
        bm = load(os.path.join(OUT, f'beard-mask-{view}.png')); beard = (bm[..., 0] > 0.6) & (bm[..., 1] < 0.3) & (bm[..., 3] > 0.5)
        x0, y0, x1, y1 = panels[view]; crop = sheet[y0:y1, x0:x1, :3]
        bg = np.median(crop[:12, -25:].reshape(-1, 3), 0); rm_c = np.linalg.norm(crop - bg, axis=-1) > 0.08
        top_r = int(np.where(rm_c.sum(1) > 3)[0].min()); top_m = int(np.where(mm.sum(1) > 3)[0].min()); s = (378 - top_m) / 100.0
        if view == 'front':
            xr = np.where(rm_c[top_r + 65])[0].mean(); xm = np.where(mm[top_m + int(65 * s)])[0].mean()
        else:
            xr = min(int(np.where(rm_c[y])[0].min()) for y in range(top_r + 105, top_r + 150))
            xm = min(int(np.where(mm[y])[0].min()) for y in range(top_m + int(105 * s), top_m + int(150 * s)))
        yy, xx = np.mgrid[0:H, 0:W]
        sx = ((xx - xm) / s + xr).round().astype(int); sy = ((yy - top_m) / s + top_r).round().astype(int)
        ok = (sx >= 0) & (sx < crop.shape[1]) & (sy >= 0) & (sy < crop.shape[0])
        refimg = np.ones((H, W, 3), np.float32) * bg; refimg[ok] = crop[sy[ok], sx[ok]]
        mod = ren[..., :3] * ren[..., 3:4] + bg * (1 - ren[..., 3:4])
        e = beard & ~(beard & np.roll(beard, 1, 0) & np.roll(beard, -1, 0) & np.roll(beard, 1, 1) & np.roll(beard, -1, 1))
        ev, eu = np.where(e)
        a, b = refimg.copy(), mod * 0.8 + refimg * 0.2
        b[e | np.roll(e, 1, 1) | np.roll(e, 1, 0)] = (0.0, 0.85, 1.0)
        log(f'beard lines {view}: panel scale {s:.2f}, top {top_m}, x {xm:.1f}; distance of each reference line to the model beard edge')
        for (vw, name), pts in lines.items():
            if vw != view: continue
            col = (1.0, 0.55, 0.0) if name.startswith('chk') else (1.0, 0.08, 0.08)
            draw(a, pts, col); draw(b, pts, col)
            q = dense(pts)
            if name in ('cheek', 'neck'):     # above y -22.5 mm (HAIR_FADE sideburn < 0.9) the sideburn is a painted fade, no shell edge
                q = q[q[:, 1] >= 378 - (-0.0225 - 0.014) / PX]
            dist = np.array([np.sqrt(((eu - u) ** 2 + (ev - v) ** 2).min()) for u, v in q]) * PX * 1000
            log(f'  {name:13s} mean {dist.mean():4.1f} mm  max {dist.max():4.1f} mm  (n {len(q)})'
                + ('  (below the faded sideburn)' if name in ('cheek', 'neck') else ''))
        save_img(np.concatenate([a, np.ones((H, 6, 3), np.float32), b], 1), f'beard-lines-{view}.png')
        cx0, cy0, cx1, cy1 = crops[view]
        def fit(img):
            c = img[cy0:cy1, cx0:cx1]; h = 420; w = int(round(c.shape[1] * h / c.shape[0]))
            return c[(np.arange(h) * c.shape[0] / h).astype(int)][:, (np.arange(w) * c.shape[1] / w).astype(int)]
        rows.append(np.concatenate([fit(a), np.ones((420, 6, 3), np.float32), fit(b)], 1))
    wmax = max(r.shape[1] for r in rows)
    rows = [np.concatenate([r, np.ones((420, wmax - r.shape[1], 3), np.float32)], 1) for r in rows]
    save_img(np.concatenate([rows[0], np.ones((6, wmax, 3), np.float32), rows[1]], 0), 'beard-lines.jpg', 'JPEG')
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk:
            for kb in sk.key_blocks: kb.value = 0.0

def live_beard_lines(smile=REF_SMILE):
    """Draw the facial-hair reference lines in the open Blender (red, check lines orange): front lines just in front of the
    face (Front view, numpad 1), profile lines beside the head (Right view, numpad 3); the smile keys go to the sheet's value."""
    c = coll(COLL + 'Ref')
    for ob in [o for o in c.objects if o.name.startswith('beardline')]: bpy.data.objects.remove(ob, do_unlink=True)
    red, orange = mat('pv_refline', 0xff1a1a, 0.6), mat('pv_refcheck', 0xff8c00, 0.6)
    for (view, name), pts in beard_line_px().items():
        if view == 'front': P3 = [((u - 392) * PX, -0.16, ry_(v)) for u, v in pts]
        else: P3 = [(0.13, -(400 - u) * PX, ry_(v)) for u, v in pts]
        cu = bpy.data.curves.new('beardline', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.00045
        sp = cu.splines.new('POLY'); sp.points.add(len(P3) - 1)
        for i, p in enumerate(P3): sp.points[i].co = (*p, 1)
        ob = bpy.data.objects.new(f'beardline_{view}_{name}', cu); c.objects.link(ob)
        cu.materials.append(orange if name.startswith('chk') else red)
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk and 'smile' in sk.key_blocks: sk.key_blocks['smile'].value = smile

def face_line_px(view, model):
    """FACE_LINES / FACE_LINES_SIDE / HAIR_FADE as polylines in a render frame: {name: [(u, v), ...]}. model=True puts the
    face's centre line at u 392 (the model's x = 0), else where it is on the mapped sheet (396.5; the mouth 397)."""
    out = {}
    if view == 'front':
        c, cm = (392.0, 392.0) if model else (396.5, 397.0)
        for nm in ('eye_up', 'eye_lo'):
            for s in (-1, 1): out[f'{nm}_{s}'] = [(c + s * d, v) for d, v in FACE_LINES[nm]]
        d0, v0, a, b, n = FACE_LINES['rim']; th = np.linspace(0, 2 * math.pi, 121)
        for s in (-1, 1):
            out[f'rim_{s}'] = list(zip(c + s * d0 + np.sign(np.cos(th)) * np.abs(np.cos(th)) ** (2 / n) * a,
                                       v0 - np.sign(np.sin(th)) * np.abs(np.sin(th)) ** (2 / n) * b))
            di, vi, r = FACE_LINES['iris']
            out[f'chk_iris_{s}'] = list(zip(c + s * di + r * np.cos(th), vi + r * np.sin(th)))
        out['bridge'] = [(c + s * d, v) for s in (-1,) for d, v in FACE_LINES['bridge'][::-1]] + [(c + d, v) for d, v in FACE_LINES['bridge']]
        for nm in ('open_top', 'open_bot', 'lip_lo'):
            out[nm] = [(cm - d, v) for d, v in FACE_LINES[nm][::-1]] + [(cm + d, v) for d, v in FACE_LINES[nm][1:]]
        J = FACE_LINES['jaw']; out['jaw'] = [(c - d, v) for d, v in J] + [(c + d, v) for d, v in J[::-1][1:]]
        for s in (-1, 1): out[f'crease_{s}'] = [(cm + s * d, v) for d, v in FACE_LINES['crease']]
    elif view == 'side':
        out['arm'] = list(FACE_LINES_SIDE['arm'])
        out['fade_dense'] = list(HAIR_FADE['side_dense']); out['fade_skin'] = list(HAIR_FADE['side_skin'])
    else:
        c = 408.0 if model else 407.5
        for nm in ('dense', 'skin'):
            L = HAIR_FADE['back_' + nm]; out['fade_' + nm] = [(c - d, v) for d, v in L[::-1]] + [(c + d, v) for d, v in L[1:]]
    return out

def face_lines_check(sheet_path):
    """Eyes, glasses, mouth and the hair fade against the sheet's lines (FACE_LINES, FACE_LINES_SIDE, HAIR_FADE) at the sheet's
    smile, with the squint the rig adds to it. Writes face-lines.jpg (reference | model with the lines, red; check lines
    orange: eyes and glasses, mouth, profile, back) and logs each line's distance to the model in mm: lid margins, rims,
    bridge, lips and the arm from an object-colour pass, the fade from the 20 % / 80 % darkness rows of the preview renders."""
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if not sk: continue
        if 'smile' in sk.key_blocks: sk.key_blocks['smile'].value = REF_SMILE
        if 'squint' in sk.key_blocks: sk.key_blocks['squint'].value = 0.3 * REF_SMILE
    render_views(('front', 'side', 'back'))
    sc = bpy.context.scene; engine = sc.render.engine; hidden = []
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'OBJECT'
    ids = {'eye': (0, 0, 1), 'rim': (1, 0, 1), 'frame': (1, 0, 1), 'lip': (1, 0, 0), 'teeth': (1, 1, 1), 'mouth': (0, 0, 0)}
    for ob in coll().objects:
        role = ob.name.split('_')[0]; ob.color = (*ids.get(role, (0.5, 0.5, 0.5)), 1)
        if ob.name == 'lip_L': ob.color = (0, 1, 0, 1)
        if role == 'lens' and not ob.hide_render: ob.hide_render = True; hidden.append(ob)
    for view in ('front', 'side'):
        sc.camera = bpy.data.objects['cam_' + view]; sc.render.filepath = os.path.join(OUT, f'face-mask-{view}.png')
        bpy.ops.render.render(write_still=True)
    for ob in hidden: ob.hide_render = False
    sc.render.engine = engine
    def load(p):
        im = bpy.data.images.load(p, check_existing=False); w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    def save_img(arr, name, fmt='PNG'):
        out = np.concatenate([np.clip(arr, 0, 1), np.ones(arr.shape[:2] + (1,), np.float32)], -1)
        im = bpy.data.images.new('fl', out.shape[1], out.shape[0]); im.pixels = out[::-1].reshape(-1).tolist()
        im.filepath_raw = os.path.join(OUT, name); im.file_format = fmt; im.save()
    def draw(img, pts, col):
        Q = np.asarray(pts, dtype=float)
        for (ax_, ay_), (bx_, by_) in zip(Q[:-1], Q[1:]):
            for t_ in np.linspace(0, 1, int(max(abs(bx_ - ax_), abs(by_ - ay_)) * 2) + 2):
                u, v = int(round(ax_ + (bx_ - ax_) * t_)), int(round(ay_ + (by_ - ay_) * t_))
                if 0 <= v < img.shape[0] and 0 <= u < img.shape[1]: img[max(v - 1, 0):v + 1, max(u - 1, 0):u + 1] = col
    def blur(L, k=9):
        c = np.pad(L, k // 2, mode='edge').cumsum(0).cumsum(1); c = np.pad(c, ((1, 0), (1, 0)))
        return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
    def fade_rows(L, alpha, u, rows):
        """Rows where a column's blurred darkness falls through 80 % and 20 % between its hair and its skin below the hair."""
        col = L[rows[0]:rows[1], u]; a = alpha[rows[0]:rows[1], u] > 0.5
        if a.sum() < 20: return None
        dark = np.percentile(col[a], 5); skin_ = col[a & (col > dark + 0.25 * (col[a].max() - dark))]
        if len(skin_) < 8: return None
        skin = np.median(skin_); hi, lo = dark + 0.2 * (skin - dark), dark + 0.8 * (skin - dark)
        i = 0
        while i < len(col) and (col[i] < hi or not a[i]): i += 1
        j = i
        while j < len(col) and col[j] < lo: j += 1
        return (rows[0] + i, rows[0] + j) if j < len(col) else None
    sheet = load(sheet_path); panels = {'front': (0, 640, 245, 918), 'side': (500, 640, 720, 918), 'back': (720, 640, 935, 918)}
    mm_ = lambda px: px * PX * 1000
    report = {}
    def note(name, errs):
        errs = [e for e in errs if e is not None]
        if errs: report[name] = (float(np.mean(errs)), float(np.max(errs)), len(errs)); log(f'  {name:16s} mean {np.mean(errs):4.1f} mm  max {np.max(errs):4.1f} mm  (n {len(errs)})')
        else: log(f'  {name:16s} no model edge found')
    tiles = []
    for view in ('front', 'side', 'back'):
        ren = load(os.path.join(OUT, f'{view}.png')); mm = ren[..., 3] > 0.5; H, W = mm.shape
        x0, y0, x1, y1 = panels[view]; crop = sheet[y0:y1, x0:x1, :3]
        bg = np.median(crop[:12, -25:].reshape(-1, 3), 0); rm_c = np.linalg.norm(crop - bg, axis=-1) > 0.08
        top_r = int(np.where(rm_c.sum(1) > 3)[0].min()); top_m = int(np.where(mm.sum(1) > 3)[0].min()); s = (378 - top_m) / 100.0
        if view == 'side':
            xr = min(int(np.where(rm_c[y])[0].min()) for y in range(top_r + 105, top_r + 150))
            xm = min(int(np.where(mm[y])[0].min()) for y in range(top_m + int(105 * s), top_m + int(150 * s)))
        else:
            xr = np.where(rm_c[top_r + 65])[0].mean(); xm = np.where(mm[top_m + int(65 * s)])[0].mean()
        yy, xx = np.mgrid[0:H, 0:W]
        sx = ((xx - xm) / s + xr).round().astype(int); sy = ((yy - top_m) / s + top_r).round().astype(int)
        ok = (sx >= 0) & (sx < crop.shape[1]) & (sy >= 0) & (sy < crop.shape[0])
        refimg = np.ones((H, W, 3), np.float32) * bg; refimg[ok] = crop[sy[ok], sx[ok]]
        mod = ren[..., :3] * ren[..., 3:4] + bg * (1 - ren[..., 3:4])
        log(f'face lines {view}: distance of each reference line to the model (mm)')
        if view == 'front':
            fm = load(os.path.join(OUT, 'face-mask-front.png'))[..., :3]
            eye = (fm[..., 2] > 0.6) & (fm[..., 0] < 0.3) & (fm[..., 1] < 0.3)
            rim = (fm[..., 0] > 0.6) & (fm[..., 2] > 0.6) & (fm[..., 1] < 0.3)
            lipU = (fm[..., 0] > 0.6) & (fm[..., 1] < 0.3) & (fm[..., 2] < 0.3); lipL = (fm[..., 1] > 0.6) & (fm[..., 0] < 0.3)
            teeth = fm.min(-1) > 0.9
            eu, el = [], []
            for sd in (-1, 1):
                for d in np.arange(EYE_D[0] + 3, EYE_D[1] - 2, 2.0):
                    rows = np.where(eye[300:420, int(round(392 + sd * d))])[0] + 300
                    if len(rows):
                        eu.append(mm_(abs(rows.min() - prof_smooth(FACE_LINES['eye_up'], d))))
                        el.append(mm_(abs(rows.max() - prof_smooth(FACE_LINES['eye_lo'], d))))
            note('eye upper lid', eu); note('eye lower lid', el)
            d0, v0, a, b, n = FACE_LINES['rim']; er = []
            for sd in (-1, 1):
                cu = 392 + sd * d0
                for th in np.radians(np.arange(0, 360, 5)):
                    r_ref = (abs(math.cos(th) / a) ** n + abs(math.sin(th) / b) ** n) ** (-1 / n)
                    rs = np.arange(0.6 * r_ref, 1.3 * r_ref, 0.25)
                    us = np.round(cu + rs * math.cos(th)).astype(int); vs = np.round(v0 - rs * math.sin(th)).astype(int)
                    hit = rim[vs, us]
                    if hit.any():
                        k0 = int(np.argmax(hit)); k1 = k0
                        while k1 + 1 < len(hit) and hit[k1 + 1]: k1 += 1
                        er.append(mm_(abs(0.5 * (rs[k0] + rs[k1]) - r_ref)))
            note('glasses rim', er)
            cols = [int(392 + d) for d in range(-12, 13, 2)]
            br = [mm_(abs(np.where(rim[330:380, u])[0].mean() + 330 - FACE_LINES['bridge'][0][1])) for u in cols if rim[330:380, u].any()]
            note('bridge', br)
            ot, ob_, cr = [], [], []
            for sd in (-1, 1):
                for d in range(0, 88, 3):
                    u = int(round(392 + sd * d)); ru = np.where(lipU[500:600, u])[0]; rl = np.where(lipL[500:600, u])[0]
                    if not len(ru) or not len(rl): continue
                    top_open, bot_open = ru.max() + 501, rl.min() + 500
                    if d <= FACE_LINES['open_top'][-1][0]:
                        ot.append(mm_(abs(top_open - prof_smooth(FACE_LINES['open_top'], d))))
                        ob_.append(mm_(abs(bot_open - prof_smooth(FACE_LINES['open_bot'], d))))
                    if d >= FACE_LINES['crease'][0][0]:
                        cr.append(mm_(abs(0.5 * (top_open + bot_open) - prof_smooth(FACE_LINES['crease'], d))))
            note('mouth open top', ot); note('mouth open bottom', ob_); note('mouth crease', cr)
            ll = []
            for sd in (-1, 1):
                for d, v in FACE_LINES['lip_lo'][:-1]:
                    rl = np.where(lipL[540:600, int(round(392 + sd * d))])[0]
                    if len(rl): ll.append(mm_(abs(rl.max() + 540 - v)))
            note('lower lip bottom', ll)
            jw = []
            for d, v in FACE_LINES['jaw'][:-1]:
                cols = np.where(mm[v])[0]
                if len(cols): jw.append(mm_(abs(0.5 * (cols.max() - cols.min()) - d)))
            rows_c = np.where(mm[:, 392])[0]; jb = rows_c.max() if len(rows_c) else 0
            jw.append(mm_(abs(jb - FACE_LINES['jaw'][-1][1])))
            note('jaw outline', jw); log(f'  chin bottom at the centre: model v {jb}, sheet {FACE_LINES["jaw"][-1][1]}')
            tc = np.where(teeth[520:570].any(0))[0]
            if len(tc): log(f'  teeth show from u {tc.min()} to {tc.max()} (d {392 - tc.min()} / {tc.max() - 392}; sheet ~38)')
        elif view == 'side':
            fm = load(os.path.join(OUT, 'face-mask-side.png'))[..., :3]
            rim = (fm[..., 0] > 0.6) & (fm[..., 2] > 0.6) & (fm[..., 1] < 0.3)
            ea = []
            for u in range(150, 320, 6):
                rows = np.where(rim[320:390, u])[0]
                if len(rows): ea.append(mm_(abs(rows.mean() + 320 - prof(FACE_LINES_SIDE['arm'], u))))
            note('glasses arm', ea)
        if view in ('side', 'back'):
            Lr = blur(refimg @ np.array([0.299, 0.587, 0.114], dtype=np.float32)); Lm = blur(mod @ np.array([0.299, 0.587, 0.114], dtype=np.float32))
            alpha_r = np.ones((H, W)); alpha_m = ren[..., 3]
            lines = face_line_px(view, True); fd, fs = [], []
            for (ud, vd), (us_, vs_) in zip(lines['fade_dense'], lines['fade_skin']):
                u = int(round(ud)); res = fade_rows(Lm, alpha_m, u, (max(int(vd) - 70, 0), min(int(vs_) + 70, H)))
                if res: fd.append(mm_(abs(res[0] - vd))); fs.append(mm_(abs(res[1] - vs_)))
            note('fade dense edge', fd); note('fade skin edge', fs)
        A, B = refimg.copy(), mod * 0.85 + refimg * 0.15
        for img, model in ((A, False), (B, True)):
            for nm, pts in face_line_px(view, model).items():
                draw(img, pts, (1.0, 0.55, 0.0) if nm.startswith('chk') or nm == 'fade_skin' else (1.0, 0.08, 0.08))
        box = {'front': (190, 290, 600, 600), 'side': (30, 280, 560, 600), 'back': (220, 380, 600, 600)}[view]
        def fit(img, h=300):
            c = img[box[1]:box[3], box[0]:box[2]]; w = int(round(c.shape[1] * h / c.shape[0]))
            return c[(np.arange(h) * c.shape[0] / h).astype(int)][:, (np.arange(w) * c.shape[1] / w).astype(int)]
        h = 420 if view == 'front' else 300
        tiles.append(np.concatenate([fit(A, h), np.ones((h, 6, 3), np.float32), fit(B, h)], 1))
        save_img(np.concatenate([A, np.ones((H, 6, 3), np.float32), B], 1), f'face-lines-{view}.png')
    wmax = max(t.shape[1] for t in tiles)
    tiles = [np.concatenate([t, np.ones((t.shape[0], wmax - t.shape[1], 3), np.float32)], 1) for t in tiles]
    save_img(np.concatenate(sum([[t, np.ones((6, wmax, 3), np.float32)] for t in tiles], [])[:-1], 0), 'face-lines.jpg', 'JPEG')
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk:
            for kb in sk.key_blocks: kb.value = 0.0
    return report

def live_face_lines(smile=REF_SMILE):
    """Draw the eye, glasses, mouth and fade reference lines in the open Blender (red, checks orange): front lines just in
    front of the face (Front view), the arm and the side fade lines beside the head (Right view), the back fade lines behind it
    (Back view); the smile keys go to the sheet's value."""
    c = coll(COLL + 'Ref')
    for ob in [o for o in c.objects if o.name.startswith('faceline')]: bpy.data.objects.remove(ob, do_unlink=True)
    red, orange = mat('pv_refline', 0xff1a1a, 0.6), mat('pv_refcheck', 0xff8c00, 0.6)
    for view in ('front', 'side', 'back'):
        for name, pts in face_line_px(view, True).items():
            if view == 'front': P3 = [((u - 392) * PX, -0.16, ry_(v)) for u, v in pts]
            elif view == 'side': P3 = [(0.13, -(400 - u) * PX, ry_(v)) for u, v in pts]
            else: P3 = [(-(u - 408) * PX, 0.16, ry_(v)) for u, v in pts]
            cu = bpy.data.curves.new('faceline', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.00035
            sp = cu.splines.new('POLY'); sp.points.add(len(P3) - 1)
            for i, p in enumerate(P3): sp.points[i].co = (*p, 1)
            ob = bpy.data.objects.new(f'faceline_{view}_{name}', cu); c.objects.link(ob)
            cu.materials.append(orange if name.startswith('chk') or name == 'fade_skin' else red)
    for ob in coll().objects:
        sk = getattr(ob.data, 'shape_keys', None)
        if sk and 'smile' in sk.key_blocks: sk.key_blocks['smile'].value = smile

if __name__ == '__main__':
    try:
        skin = build()
        if '--measure' in ARGS: measure(arg('--ref'))
        if arg('--side'): measure_side(arg('--side'))
        if arg('--turnaround'): measure_turnaround(arg('--turnaround'))
        if arg('--beard-lines'): beard_lines_check(arg('--beard-lines'))
        if arg('--face-lines'): face_lines_check(arg('--face-lines'))
        for kv in (arg('--keys') or '').split(','):              # e.g. --keys blinkL=1,smile=0.6 (preview only, every part with that key)
            if '=' not in kv: continue
            k, v = kv.split('=')
            for ob in coll().objects:
                sk = getattr(ob.data, 'shape_keys', None)
                if sk and k in sk.key_blocks: sk.key_blocks[k].value = float(v)
        if '--render' in ARGS:
            views = tuple(arg('--views', 'front,q34').split(','))
            render_views(views)
            ref = arg('--ref')
            if ref and 'front' in views:
                overlay(ref, os.path.join(OUT, 'front.png'), os.path.join(OUT, 'overlay-front.png'))
                diff_overlay(ref, os.path.join(OUT, 'front.png'), os.path.join(OUT, 'diff'))
        for ob in coll().objects:
            sk = getattr(ob.data, 'shape_keys', None)
            if sk:
                for kb in sk.key_blocks: kb.value = 0.0
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'pharmacist_head.blend'))
        if '--no-export' not in ARGS:
            export_glb(os.path.join(ROOT, 'public', 'assets', 'models', 'pharmacist-head.glb'))
        log('done')
    except Exception:
        import traceback; log(traceback.format_exc()); raise
