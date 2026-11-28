"""
Customer head + hijab, authored in Blender (headless):

    powershell -File tools/blender/run.ps1 tools/blender/customer_head.py [--measure] [--no-export] [--out <dir>]

Frame: three.js head frame (x right, y up, z forward, metres, origin at skull centre, headScale baked in).
Converted to Blender axes (x, -z, y) when meshes are made so glTF export (+Y up) matches the rig.

Parts:
  - skin (morphs blinkL, blinkR, squint, smile, frown, open; vertex colour shading)
  - eye_L, eye_R (origin at eyeball centre)
  - brow_L, brow_R (smooth arched female brows)
  - lip_U, lip_L, teeth, mouth (morphs smile, frown, open)
  - hijab (fitted to Front, Left/Right Profile, and Back Head boundaries from customer-turnaround.jpg)
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS and ARGS.index(name) + 1 < len(ARGS) else default
def flag(name):
    return name in ARGS

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = arg('--out', os.path.join(ROOT, 'renders', 'customer'))
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'log.txt'), 'w')
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s); LOG.write(s + '\n'); LOG.flush()

# --------------------------------------------------------------------------- parameters & reference frame
# Calibrated to customer-turnaround.jpg bottom row (Y0=565..785):
#   front crop [31:213], centre x = 93.25; eye line v = 94.0 -> y = +0.014 m;
#   hijab crown v = 8 -> +0.136 m, chin v = 177 -> -0.104 m (169 px = 0.240 m -> PX = 0.00142 m/px).
HS = 1.11
PX = 0.00142
FRONT_CX = 93.25
EYE_V = 94.0
SIDE_NOSE_U = 16.0
SIDE_NOSE_Z = 0.1180   # nose tip z in final head frame (metres)

def rx_(px): return (px - FRONT_CX) * PX
def ry_(py): return 0.014 + (EYE_V - py) * PX
def sz_(u):  return SIDE_NOSE_Z - (u - SIDE_NOSE_U) * PX

# Face sculpt (design space, pre-HS) — soft, youthful female proportions matching customer-turnaround.jpg
F = dict(
    rx=0.072, ry=0.106, rz=0.090,
    eyeX=0.0345, eyeY=0.0125,
    jawNarrow=0.18, browRidge=0.0008, socket=0.0055, cheek=0.0055, jawAngle=0.0005,
    noseBridge=0.0045, noseDorsum=0.0075, noseTip=0.0110, noseW=0.95, alae=0.0075, muzzle=0.0105,
    chin=0.018, chinDrop=0.0045, lipW=0.0290, noseY=0.0045, lowC=0.80, crown=0.002,
    socketW=1.18, socketX=1.0, socketIn=0.0, lowW=(0.14, 0.03), cheekFull=0.0042,
    mouthY=-0.0560, chinW=1.15, crownW=0.10, temple=0.0020,
    frontZ=0.044, backZ=(0.40, 0.65), foreheadZ=0.016,
)

EYE = dict(R=0.0205, protrude=0.0052, dy=0.0012, lidT=0.0018, clear=0.0011)
REF_SMILE = 0.60

# Traced reference lines in local crop px (v down from Y0=565; d = px from centre line)
FACE_LINES = dict(
    # Big warm almond eyes: inner corner d=14.5, outer corner d=43.0
    eye_up=[(14.5, 95.5), (19.0, 89.5), (25.0, 86.2), (31.5, 86.0), (37.5, 88.2), (43.0, 93.5)],
    eye_lo=[(14.5, 95.5), (19.5, 98.2), (25.5, 99.6), (31.5, 99.6), (37.5, 97.6), (43.0, 93.5)],
    iris=(28.0, 92.8, 7.6),
    # Smooth arched brows
    brow=[(15.5, 76.5), (23.0, 73.0), (31.0, 72.2), (39.0, 74.0), (45.5, 77.5)],
    # Gentle smiling mouth (d from centre): closed soft smile in the sheet
    open_top=[(0, 141.5), (10, 141.2), (18, 139.8), (24.5, 137.5)],
    open_bot=[(0, 142.8), (10, 142.4), (18, 140.5), (24.5, 137.5)],
    crease=[(18, 139.8), (22, 138.8), (24.5, 137.5)],
    lip_up=[(0, 136.5), (8, 136.8), (16, 138.0), (24.5, 137.5)],
    lip_lo=[(0, 151.5), (8, 150.5), (16, 147.0), (22, 142.0), (24.5, 137.5)],
)

# Hijab & face-opening boundary lines (px in crop frame, y=8..215)
HIJAB_LINES = dict(
    # Front view: outer hijab half-width (d, v)
    front_outer=[
        (0, 8), (18, 11), (34, 19), (47, 32), (56, 48), (62, 65), (66, 82),
        (68, 98), (67, 115), (65, 132), (61, 148), (57, 162), (53, 175), (60, 188), (74, 202),
    ],
    # Front view: face opening half-width (d, v) from forehead v=39 down to chin v=176
    front_open=[
        (0, 39), (14, 41), (26, 47), (36, 57), (43, 70), (48, 84), (50, 98),
        (49, 113), (46, 128), (41, 142), (34, 154), (25, 164), (14, 172), (0, 176),
    ],
    # Side view: outer hijab front edge (u, v) — crown -> forehead -> drape under chin -> cowl front
    side_front=[
        (98, 8), (76, 11), (56, 19), (42, 30), (35, 42), (42, 54), (54, 70),
        (66, 88), (72, 106), (70, 126), (65, 146), (61, 166), (57, 182), (56, 200),
    ],
    # Side view: outer hijab back edge (u, v) — crown -> occiput -> nape -> cowl back
    side_back=[
        (98, 8), (122, 11), (142, 20), (158, 34), (169, 52), (176, 72), (177, 94),
        (178, 116), (176, 138), (174, 158), (171, 176), (165, 192),
    ],
    # Side view: face profile (u, v) — forehead -> brow -> nose -> lips -> chin
    side_face=[
        (36, 46), (32, 60), (30, 75), (31, 88), (28, 100), (20, 110), (16, 115),
        (22, 123), (25, 130), (24, 138), (26, 147), (28, 156), (33, 164), (44, 169), (60, 168),
    ],
    # Back view: outer hijab half-width (d, v)
    back_outer=[
        (0, 8), (20, 11), (38, 20), (51, 34), (59, 50), (65, 68), (69, 84),
        (70, 98), (68, 114), (65, 130), (61, 146), (57, 160), (54, 172), (66, 190), (74, 202),
    ],
)

CUBE_CUTS = int(arg('--cuts', 96))

def sstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def mix(a, b, t): return a + (b - a) * t

def gs(P, c, r):
    d = (P - np.array(c)) / np.array(r)
    return np.exp(-(d * d).sum(-1))

def prof(rows, k): return np.interp(k, [r[0] for r in rows], [r[1] for r in rows])

def prof_smooth(rows, k):
    xs = np.array([r[0] for r in rows], dtype=float)
    ys = np.array([r[1] for r in rows], dtype=float)
    n = len(xs)
    if n < 3: return np.interp(k, xs, ys)
    h = np.diff(xs); delta = np.diff(ys) / h; d = np.zeros(n, dtype=float)
    d[0], d[-1] = delta[0], delta[-1]
    for i in range(1, n - 1):
        if delta[i - 1] * delta[i] > 0.0:
            w1 = 2.0 * h[i] + h[i - 1]; w2 = h[i] + 2.0 * h[i - 1]
            d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    kv = np.asarray(k, dtype=float); idx = np.clip(np.searchsorted(xs, kv, side='right') - 1, 0, n - 2)
    hi = h[idx]; t = np.clip((kv - xs[idx]) / hi, 0.0, 1.0); t2 = t * t; t3 = t2 * t
    return (2*t3 - 3*t2 + 1)*ys[idx] + (t3 - 2*t2 + t)*hi*d[idx] + (-2*t3 + 3*t2)*ys[idx+1] + (t3 - t2)*hi*d[idx+1]

# --------------------------------------------------------------------------- skull sculpt
def sculpt(P, F):
    P = P.copy()
    def add(ax, amt): P[:, ax] += amt
    y, z, ax = P[:, 1], P[:, 2], np.abs(P[:, 0])
    above = sstep(-0.02, 0.095, y); jaw = sstep(0.01, -0.095, y)
    P[:, 0] *= 1 - jaw * F['jawNarrow'] - above * F.get('crownW', 0)
    P[:, 2] *= 1 - jaw * 0.14
    if F.get('temple'):
        P[:, 0] -= np.sign(P[:, 0]) * F['temple'] * sstep(0.02, 0.075, y) * sstep(0.015, 0.06, ax) * sstep(0.0, 0.05, z)
    P[:, 1] += (F['crown'] + 0.006 * sstep(0.06, 0.11, y) * sstep(0.02, -0.05, z)) * sstep(0.03, 0.11, y)
    for s in (1, -1):
        add(2, -F['socket'] * gs(P, (s * F['eyeX'] * F['socketX'] - s * F.get('socketIn', 0), F['eyeY'] + 0.002, 0.088),
                                   (0.018 * F['socketW'], 0.013, 0.035)))
    add(2, F['browRidge'] * gs(P, (0, F['eyeY'] + 0.022, 0.09), (0.044, 0.009, 0.035)))
    for s in (1, -1):
        add(2, F['cheek'] * gs(P, (s * 0.036, -0.022, 0.082), (0.021, 0.017, 0.038)))
        if F.get('cheekFull'):
            P[:, 0] += s * F['cheekFull'] * gs(P, (s * 0.054, -0.028, 0.045), (0.020, 0.026, 0.040))
    add(2, F['noseBridge'] * gs(P, (0, 0.010, 0.09), (0.007 * F['noseW'], 0.012, 0.03)))
    add(2, F['noseDorsum'] * gs(P, (0, -0.014 + F['noseY'], 0.092), (0.0075 * F['noseW'], 0.016, 0.03)))
    add(2, F['noseTip'] * gs(P, (0, -0.028 + F['noseY'], 0.095), (0.010 * F['noseW'], 0.009, 0.03)))
    add(1, -0.003 * gs(P, (0, -0.031 + F['noseY'], 0.095), (0.011, 0.009, 0.03)))
    for s in (1, -1):
        add(2, F['alae'] * gs(P, (s * 0.011 * F['noseW'], -0.031 + F['noseY'], 0.092), (0.006, 0.006, 0.022)))
        add(0, s * 0.004 * F['noseW'] * gs(P, (s * 0.011 * F['noseW'], -0.031 + F['noseY'], 0.092), (0.006, 0.006, 0.022)))
    add(2, F['muzzle'] * gs(P, (0, -0.055, 0.088), (0.026, 0.018, 0.04)))
    add(1, -F['chinDrop'] * gs(P, (0, -0.096, 0.058), (0.024 * F['chinW'], 0.024, 0.034)))
    add(2, F['chin'] * gs(P, (0, -0.090, 0.072), (0.018 * F['chinW'], 0.014, 0.032)))
    add(2, 0.012 * sstep(-0.032, -0.072, P[:, 1]) * sstep(0.005, -0.045, P[:, 2]))
    if F.get('foreheadZ'): add(2, F['foreheadZ'] * sstep(0.020, 0.080, P[:, 1]) * sstep(-0.02, 0.05, P[:, 2]))
    return P

def warp_face(P, F):
    P = P.copy(); d = F['eyeY'] - P[:, 1]; m = d > 0
    P[:, 1] = np.where(m, F['eyeY'] - d * (1 - F['lowC'] * d * sstep(-0.045, 0.03, P[:, 2])), P[:, 1])
    return P

def lock_face_profile(P):
    """Fit front face silhouette & side face profile (forehead, nose, mouth, chin) onto HIJAB_LINES."""
    P = P.copy()
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    # Match side face profile z(y) on the front centre band
    rows_sf = sorted([(ry_(v), sz_(u)) for u, v in HIJAB_LINES['side_face']])
    target_z = np.interp(y, [r[0] for r in rows_sf], [r[1] for r in rows_sf])
    w_mid = sstep(0.038, 0.006, ax) * sstep(0.038, 0.070, z) * sstep(-0.108, -0.095, y) * sstep(0.088, 0.075, y)
    z = mix(z, target_z, 0.85 * w_mid)
    # Fullness on lower chin tip (v=160..170) to match side_face cyan line
    chin_w = sstep(-0.075, -0.095, y) * sstep(-0.112, -0.100, y) * sstep(0.032, 0.008, ax) * sstep(0.045, 0.075, z)
    y = y - 0.0035 * chin_w
    z = z + 0.0025 * chin_w
    # Taper lower neck/chin cleanly inside hijab cowl at bottom
    under = sstep(-0.096, -0.116, y)
    x = x * mix(1.0, 0.58, under)
    z = z * mix(1.0, 0.68, under) + 0.008 * under
    return np.stack([x, y, z], 1)

def skull_points(D, F):
    P0 = np.stack([D[:, 0] * F['rx'], D[:, 1] * F['ry'], D[:, 2] * F['rz']], 1)
    Pd = sculpt(P0, F)
    P = lock_face_profile(warp_face(Pd, F) * HS)
    return P, Pd

# --------------------------------------------------------------------------- mesh helpers
COLL = 'CustomerHead'
def coll(name=COLL):
    c = bpy.data.collections.get(name)
    if c is None: c = bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    return c

def to_bl(P): return np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
def from_bl(P): return np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)

def make_object(name, verts_t, faces, uv=None, origin=None):
    V = np.asarray(verts_t, dtype=float)
    if origin is not None: V = V - np.asarray(origin)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in to_bl(V)], [], faces)
    me.update(); ob = bpy.data.objects.new(name, me)
    coll().objects.link(ob)
    if origin is not None: ob.location = tuple(to_bl(np.asarray(origin, dtype=float)[None])[0])
    for p in me.polygons: p.use_smooth = True
    if uv is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            us = [uv[me.loops[li].vertex_index][0] for li in poly.loop_indices]
            wrap = (max(us) - min(us)) > 0.5
            for li in poly.loop_indices:
                u, v = uv[me.loops[li].vertex_index]
                layer.data[li].uv = (u + 1.0 if wrap and u < 0.5 else u, v)
    return ob

def set_colours(ob, c):
    c = np.asarray(c, dtype=np.float32); rgb = np.repeat(c[:, None], 3, 1) if c.ndim == 1 else c
    rgba = np.concatenate([rgb, np.ones((len(rgb), 1), np.float32)], 1)
    col = ob.data.color_attributes.get('Col') or ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', rgba.ravel()); ob.data.color_attributes.active_color = col

def cube_sphere(cuts, refine=()):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts - 1, use_grid_fill=True)
    for v in bm.verts: v.co = (v.co.x, v.co.z, v.co.y)
    bm.normal_update(); bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
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

def spherical_uv(P):
    return np.stack([np.arctan2(P[:, 0], P[:, 2]) / (2 * math.pi) + 0.5,
                     np.arcsin(np.clip(P[:, 1] / np.linalg.norm(P, axis=1), -1, 1)) / math.pi + 0.5], 1)

# --------------------------------------------------------------------------- eyes & lids
EYE_D = (FACE_LINES['eye_up'][0][0], FACE_LINES['eye_up'][-1][0])
IRIS = (round(math.asin(FACE_LINES['iris'][2] * PX / EYE['R']) / math.pi, 3),
        round(math.asin(0.50 * FACE_LINES['iris'][2] * PX / EYE['R']) / math.pi, 3))

def lid_margins(d, ku=1.0, kl=1.0):
    U, Lo = ry_(prof_smooth(FACE_LINES['eye_up'], d)), ry_(prof_smooth(FACE_LINES['eye_lo'], d))
    (d0, v0), (d1, v1) = FACE_LINES['eye_up'][0], FACE_LINES['eye_up'][-1]
    C = ry_(v0 + (v1 - v0) * np.clip((d - d0) / (d1 - d0), 0, 1))
    return C + ku * (U - C), C - kl * (C - Lo), C

def carve_lids(P, centres, ku=(1.0, 1.0), kl=(1.0, 1.0), shut=(False, False)):
    P = P.copy(); R = EYE['R']; shade = np.ones(len(P))
    d_in, d_out = EYE_D; dm, hw = 0.5 * (d_in + d_out), 0.5 * (d_out - d_in)
    for (ex, ey, ez, _), ku_, kl_, sh in zip(centres, ku, kl, shut):
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
        lid = np.where(inside_sph, np.maximum(nat, sph + EYE['clear'] + bump), nat)
        ap = np.where(inside_sph, np.minimum(nat, sph - 0.0007), nat)
        win = sstep(0.0004, -0.0004, d)
        z = lid * (1 - win) + ap * win
        if sh:
            z = z - 0.0005 * np.exp(-((ym - (Yl + 0.0016 * tt)) / 0.0011) ** 2) * (tt > 0.05)
        else:
            crease = np.exp(-((ym - (Yu + 0.0044)) / 0.0015) ** 2) * (tt > 0.12)
            z = z - 0.0005 * crease * (1 - win)
        P[m, 2] = z
        up = ym > Yc + 0.0008 * tt
        lash_u = np.exp(-((d - 0.0002) / 0.00115) ** 2) * up
        lash_l = np.exp(-((d - 0.0001) / 0.00070) ** 2) * ~up
        s_ = (1 - 0.88 * lash_u * (tt > 0.02)) * (1 - 0.40 * lash_l * (tt > 0.02))
        s_ = s_ * (1 - 0.14 * np.exp(-(np.maximum(d, 0) / 0.0040) ** 2) * (d > 0))
        if not sh:
            cr_s = np.exp(-((ym - (Yu + 0.0044)) / 0.0018) ** 2) * (tt > 0.12)
            s_ = s_ * (1 - 0.15 * cr_s)
        shade[m] = np.minimum(shade[m], s_)
    return P, shade

def eyeball(name, centre, R):
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
            a = j * (W + 1) + i; faces.append([a, a + W + 1, a + W + 2, a + 1])
    return make_object(name, np.array(verts), faces, np.array(uvs), origin=(ex, ey, ez))

# --------------------------------------------------------------------------- brows
def brows(skin_bvh_z):
    pts = FACE_LINES['brow']
    wid = [0.0030, 0.0033, 0.0030, 0.0023, 0.0011]
    C = np.array([(d * PX, ry_(v)) for d, v in pts]); W = np.array(wid)
    u = np.linspace(0, 1, 48); idx = np.linspace(0, len(C) - 1, 48)
    cx = np.interp(idx, range(len(C)), C[:, 0]); cy = np.interp(idx, range(len(C)), C[:, 1])
    cap = np.sqrt(np.clip(np.minimum(u / 0.08, (1 - u) / 0.08), 0.0, 1.0))
    w = np.interp(idx, range(len(C)), W) * (0.25 + 0.75 * cap)
    tan = np.stack([np.gradient(cx), np.gradient(cy)], 1); tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1); K = 9; objs = []
    for s in (1, -1):
        verts, faces = [], []
        for i in range(len(cx)):
            for k in range(K):
                a = k / (K - 1) * 2 - 1
                x = cx[i] + nrm[i, 0] * a * w[i]; y = cy[i] + nrm[i, 1] * a * w[i]
                px_ = s * x
                z = skin_bvh_z(px_, y) + 0.0003 + 0.0015 * math.sqrt(max(0, 1 - a * a)) * (w[i] / 0.0040) * (0.3 + 0.7 * cap[i])
                verts.append((px_, y, z))
        for i in range(len(cx) - 1):
            for k in range(K - 1):
                a = i * K + k; f = [a, a + 1, a + K + 1, a + K]; faces.append(f if s < 0 else f[::-1])
        objs.append(make_object('brow_L' if s > 0 else 'brow_R', np.array(verts), faces))
    return objs

# --------------------------------------------------------------------------- lips & mouth morphs
MOUTH = dict(smileW=0.14, smileCurve=0.0095, smileOpen=0.0018, openEdge=0.45, seam=0.00040,
             bulgeU=0.0024, bulgeL=0.0026, teeth=0.0035)
LIP_TINT = dict(upper=0x6b3a2e, lower=0x824b3d)

def corner_lift(u): return sstep(0.4, 1.0, np.abs(u))

def lip_edges(smile, open_, t):
    M = MOUTH; sp, fr = max(0.0, smile), max(0.0, -smile); W = F['lipW'] * (1 + M['smileW'] * sp - 0.04 * fr)
    t2 = t * t; one = np.clip(1 - t2, 0, 1)
    lift = M['smileCurve'] * sp * corner_lift(t) - 0.0035 * fr * t2
    g_s = np.clip(1 - (t / M['openEdge']) ** 2, 0, 1) ** 0.75
    Os, Oo = sp * M['smileOpen'], open_ * 0.0110
    seam = 0.5 * M['seam'] * (1 - 0.6 * t2)
    yU = lift + seam - 0.05 * Os * g_s + 0.28 * Oo * one
    yL = lift - seam - 0.95 * Os * g_s - 0.72 * Oo * one ** 0.8
    return t * W, yU, yL, one

def lip_thickness(t):
    oy = warp_face(np.array([[0.0, F['mouthY'], 0.09]]), F)[0, 1] * HS
    x, yU, yL, one = lip_edges(REF_SMILE, 0.0, t); d = np.abs(x) * HS / PX
    top = (ry_(prof(FACE_LINES['lip_up'], d)) - oy) / HS
    thU = np.clip(top - yU, 0.0012, None) * one ** 0.15
    lo = FACE_LINES['lip_lo']; bot = (ry_(prof(lo, d)) - oy) / HS
    thL = np.clip(yL - bot, 0, None) * sstep(lo[-1][0], lo[-2][0], d)
    return thU, thL

def lip_shape(smile, open_, t):
    x, yU, yL, one = lip_edges(smile, open_, t); thU, thL = lip_thickness(t)
    return x, yU, yL, thU, thL, one

def mouth_field(P, kind, origin):
    S = HS; Q = P.copy()
    xr = P[:, 0] / S; yr = (P[:, 1] - origin[1]) / S; front = sstep(0.0, 0.045, P[:, 2] / S)
    W0 = F['lipW']
    if kind in ('smile', 'frown'):
        W1, cy = (W0 * (1 + MOUTH['smileW']), MOUTH['smileCurve']) if kind == 'smile' else (W0 * 0.96, -0.0035)
        u = np.minimum(np.abs(xr) / W1, 1.0)
        near = np.exp(-(yr / 0.015) ** 2) * np.exp(-(np.maximum(np.abs(xr) - W1, 0) / 0.016) ** 2) * front
        Q[:, 1] += cy * (corner_lift(u) if kind == 'smile' else u * u) * near * S
        Q[:, 0] += np.sign(xr) * (W1 - W0) * u * near * S
    else:
        O = 0.0110
        below = sstep(0.001, -0.009, yr) * np.exp(-(xr / 0.055) ** 2) * front
        above = np.exp(-(np.maximum(yr, 0) / 0.007) ** 2) * (yr > 0) * np.exp(-(xr / 0.032) ** 2) * front
        Q[:, 1] += (-0.72 * O * below + 0.28 * O * above) * S
    d = np.abs(Q - P).max(1); Q[d < 1e-6] = P[d < 1e-6]
    return Q

def cheek_raise(P, amt):
    Q = P.copy()
    for s in (1, -1):
        g = gs(Q, (s * 0.046, -0.026, 0.082), (0.019, 0.016, 0.038)); g = np.where(g > 0.01, g, 0.0)
        Q[:, 1] += 0.0028 * amt * g; Q[:, 2] += 0.0016 * amt * g; Q[:, 0] += s * 0.0007 * amt * g
    return Q

# --------------------------------------------------------------------------- hijab (front, side, back)
def build_hijab_mesh():
    """Sculpted hijab shell + rolled front face-opening trim + back pin drape, fitted to HIJAB_LINES
    in Front, Side, and Back views and tapering down into the rig's neck cowl (y = -0.05..-0.11 m)."""
    f_out = sorted([(ry_(v), d * PX * 1.015) for d, v in HIJAB_LINES['front_outer']])
    b_out = sorted([(ry_(v), d * PX * 1.015) for d, v in HIJAB_LINES['back_outer']])
    s_fr  = sorted([(ry_(v), sz_(u)) for u, v in HIJAB_LINES['side_front']])
    s_bk  = sorted([(ry_(v), sz_(u) - 0.0045 * sstep(ry_(45), ry_(100), ry_(v))) for u, v in HIJAB_LINES['side_back']])
    f_op  = sorted([(ry_(v), d * PX) for d, v in HIJAB_LINES['front_open']])

    y_top = ry_(8.0)          # +0.1361 m
    y_bot = ry_(202.0)        # -0.1394 m
    y_open_top = ry_(39.0)    # +0.0921 m
    y_open_bot = ry_(177.0)   # -0.1039 m

    # Parametric grid: v in [0, 1] from crown (0) to cowl hem (1);
    # u in [0, 1] wraps from the right face-opening edge (+th_open) around the back (pi) to the left edge (2*pi - th_open).
    NU, NV = 128, 96
    verts = np.zeros((NV + 1, NU + 1, 3), dtype=float)
    shade = np.ones((NV + 1, NU + 1), dtype=float)

    for j in range(NV + 1):
        v = j / NV
        if v <= 0.16:
            y = y_top - (y_top - ry_(32.0)) * (1.0 - math.cos((v / 0.16) * math.pi * 0.5))
        else:
            y = mix(ry_(32.0), y_bot, (v - 0.16) / 0.84)

        w_f = float(prof_smooth(f_out, y)) if y > ry_(35.0) else float(np.interp(y, [r[0] for r in f_out], [r[1] for r in f_out]))
        w_b = float(prof_smooth(b_out, y)) if y > ry_(35.0) else float(np.interp(y, [r[0] for r in b_out], [r[1] for r in b_out]))
        zf  = float(np.interp(y, [r[0] for r in s_fr],  [r[1] for r in s_fr]))
        zb  = float(np.interp(y, [r[0] for r in s_bk],  [r[1] for r in s_bk]))
        cap = 1.0 if j > 0 else 0.0

        in_open = (y_open_bot < y < y_open_top)
        if in_open:
            ow = float(prof_smooth(f_op, y)) * sstep(y_open_top, y_open_top - 0.012, y)
            ratio = min(0.95, max(0.0, ow) / max(w_f, 1e-4))
            th_open = math.asin(ratio)
        else:
            ow = 0.0
            th_open = 0.0

        for i in range(NU + 1):
            u = i / NU
            th = mix(th_open, 2.0 * math.pi - th_open, u)
            ct, st = math.cos(th), math.sin(th)
            half_w = mix(w_b, w_f, sstep(-0.35, 0.35, ct)) * cap
            zc = 0.5 * (zf + zb)
            half_z = 0.5 * (zf - zb) * cap

            x = half_w * st
            z = zc + half_z * ct

            # Lock the front face-opening edge onto front_open (x=±ow) and side_front (z=zf)
            if in_open:
                edge_k = max(0.0, 1.0 - min(u, 1.0 - u) / 0.10)
                if edge_k > 0.0:
                    x = mix(x, math.copysign(ow, x) if abs(x) > 1e-5 else 0.0, edge_k * 0.88)
                    z = mix(z, zf, edge_k * 0.90)
                    # Smooth rolled-hem thickness along the face opening
                    z += 0.0022 * math.sin(edge_k * math.pi)
                    shade[j, i] *= (1.0 - 0.06 * edge_k)

            # Subtle back pin & drape folds (Back Head & Left/Right Profile)
            pin_y = ry_(125.0)
            if ct < -0.15:
                dp_y = (y - pin_y) / 0.032
                dp_x = x / 0.022
                pin_g = math.exp(-(dp_y * dp_y + dp_x * dp_x))
                z += 0.0040 * pin_g
                fold = 0.0020 * math.sin(th * 7.0 + y * 32.0) * sstep(0.06, -0.08, y) * (-ct)
                x += fold * st; z += fold * ct
                shade[j, i] *= (1.0 - 0.14 * pin_g - 0.05 * max(0.0, -math.sin(th * 7.0 + y * 32.0)) * (-ct))

            # Neck wrap folds at bottom (y < -0.055 m)
            if y < -0.055:
                wrap = 0.0028 * math.sin(y * 165.0 + th * 1.4) * sstep(-0.055, -0.095, y)
                x += wrap * st; z += wrap * ct
                shade[j, i] *= (1.0 - 0.08 * max(0.0, -math.sin(y * 165.0 + th * 1.4)))

            verts[j, i] = (x, y, z)

    V = verts.reshape(-1, 3)
    SH = shade.reshape(-1)
    faces = [[j * (NU + 1) + i, (j + 1) * (NU + 1) + i, (j + 1) * (NU + 1) + i + 1, j * (NU + 1) + i + 1]
             for j in range(NV) for i in range(NU)]
    ob = make_object('hijab', V, faces, spherical_uv(V))
    set_colours(ob, SH)
    return ob

# --------------------------------------------------------------------------- Builder
class Builder:
    STAGES = ('skull', 'eyes', 'brows', 'lips', 'hijab', 'skin_detail')

    def all(self):
        for st in self.STAGES: getattr(self, st)()
        return self.skin

    def _bvh(self):
        bm = bmesh.new(); bm.from_mesh(self.skin.data); self.bvh = BVHTree.FromBMesh(bm); bm.free()

    def surface_z(self, x, y):
        hit = self.bvh.ray_cast(Vector((x, -0.6, y)), Vector((0, 1, 0)))
        return -hit[0].y if hit[0] is not None else 0.0

    def skull(self):
        D, self.faces = cube_sphere(CUBE_CUTS, refine=[((0, 0.0, 1.0), 0.62, 1)] + [((s * 0.39, 0.10, 0.91), 0.26, 1) for s in (1, -1)])
        self.P0, self.Pd = skull_points(D, F); self.P = self.P0; self.mouth_origin = None
        self.skin = make_object('skin', self.P0, self.faces, spherical_uv(self.P0)); self._bvh()
        col = self.skin.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col.data.foreach_set('color', np.ones(len(self.P0) * 4, dtype=np.float32)); self.skin.data.color_attributes.active_color = col
        log('skin verts', len(self.P0), 'faces', len(self.faces))

    def eyes(self):
        self.centres = []
        for s in (1, -1):
            ex, ey = s * F['eyeX'] * HS, F['eyeY'] * HS + EYE['dy']; nat = self.surface_z(ex, ey)
            self.centres.append((ex, ey, nat + EYE['protrude'] - EYE['R'], nat))
        self.P, self.lid_shade = carve_lids(self.P0, self.centres)
        self.skin.data.vertices.foreach_set('co', to_bl(self.P).ravel()); self.skin.data.update(); self._bvh()
        for nm, c in (('eye_L', self.centres[0][:3]), ('eye_R', self.centres[1][:3])):
            eyeball(nm, c, EYE['R'])

    def brows(self): brows(self.surface_z)

    def _mouth(self):
        if getattr(self, 'mouth_origin', None) is None:
            S = HS; MYw = warp_face(np.array([[0.0, F['mouthY'], 0.09]]), F)[0, 1]
            oy = MYw * S; z0 = self.surface_z(0.0, oy); oz = z0 + 0.0006 * S
            self.mouth_origin = np.array([0.0, oy, oz])
        return self.mouth_origin

    def lips(self):
        S = HS; origin = self._mouth(); oy, oz = origin[1], origin[2]
        NX, NT = 28, 10; M = MOUTH; t = np.linspace(-1, 1, NX + 1)
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
                b = bulge * np.clip(th / max(th.max(), 1e-6), 0, 1) ** 0.7
                for j in range(NT + 1):
                    tau = j / NT; y = mix(yIn, yOut, tau)
                    ti = 1 - tau if innerTop else tau
                    base = skin_dz(x * S, y * S) / S
                    h = math.sin(math.pi * ti) ** 0.7 if ti <= 0.5 else math.cos(math.pi * (ti - 0.5)) ** 2
                    z = base + b * h - 0.0004 * (1 - ti) ** 2 - 0.00015 * sstep(0.8, 1.0, ti)
                    rows.append(np.stack([x, y, z], 1))
                return np.concatenate(rows)
            def flat(rows_y, zoff):
                return np.concatenate([np.stack([x, ry, skin_dz(x * S, ry * S) / S + zoff], 1) for ry in rows_y])
            th = M['teeth']; s_full = M['seam'] * (1 - 0.6 * t * t); mid_ = 0.5 * (yU + yL); ul = np.abs(t) < 0.78
            tt_ = np.where(ul, yU - 0.5 * s_full, mid_)
            tb = np.where(ul, np.minimum(np.maximum(yU - th, yL + 0.5 * s_full), tt_), mid_)
            return {'lip_U': fill(yU, yU + thU, M['bulgeU'], False, thU),
                    'lip_L': fill(yL - thL, yL, M['bulgeL'], True, thL),
                    'mouth': flat([mix(yL - 0.0003, yU + 0.0003, f) for f in np.linspace(0, 1, 5)], 0.00035),
                    'teeth': flat((tb, mix(tb, tt_, 0.55), tt_), 0.0007)}
        def grid(nr):
            return [[j * (NX + 1) + i, j * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i] for j in range(nr) for i in range(NX)]
        rest, keys = geo(0, 0, 'rest'), {'smile': geo(1, 0, 'smile'), 'frown': geo(-1, 0, 'frown'), 'open': geo(0, 1, 'open')}
        at = np.abs(t); side = sstep(0.12, 0.46, at)
        def lip_rgb(tint, inner_dark, upper):
            def srgb_to_lin(h):
                c = np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255]) / 255.0
                return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
            ratio = srgb_to_lin(tint) / srgb_to_lin(0x80492d); rows = []
            for j in range(NT + 1):
                ti = j / NT if upper else 1 - j / NT
                w = sstep(1.0, 0.45, ti) * sstep(1.0, 0.7, at)
                dark = (1 - inner_dark * math.exp(-(ti / 0.16) ** 2)) * (1 - 0.15 * sstep(0.5, 1.0, at))
                rows.append((1 + (ratio[None] - 1) * w[:, None]) * mix(1.0, dark, w)[:, None])
            return np.concatenate(rows)
        colours = {'teeth': np.concatenate([(0.80 - 0.55 * side), (1.0 - 0.62 * side), (0.42 - 0.25 * side)]),
                   'mouth': np.tile(0.30 + 0.70 * (1 - sstep(0.08, 0.55, at)), 5),
                   'lip_U': lip_rgb(LIP_TINT['upper'], 0.45, True),
                   'lip_L': lip_rgb(LIP_TINT['lower'], 0.38, False)}
        for name, V in rest.items():
            nrows = {'lip_U': NT, 'lip_L': NT, 'teeth': 2, 'mouth': 4}[name]
            ob = make_object(name, V * S + origin, grid(nrows))
            set_colours(ob, colours[name])
            ob.shape_key_add(name='Basis', from_mix=False)
            for kn, G in keys.items():
                kb = ob.shape_key_add(name=kn, from_mix=False); kb.data.foreach_set('co', to_bl(G[name] * S + origin).ravel()); kb.value = 0.0

    def hijab(self):
        self.hijab_ob = build_hijab_mesh()

    def skin_detail(self):
        P, Pd = self.P, self.Pd
        sh = self.lid_shade.copy()
        for c in self.centres: sh *= 1 - 0.06 * gs(P, (c[0], c[1] + 0.002, c[3]), (0.020, 0.014, 0.03))
        for s in (1, -1): sh *= 1 - 0.48 * gs(Pd, (s * 0.0068 * F['noseW'], -0.036 + F['noseY'], 0.095), (0.0034, 0.0022, 0.02))
        warm = gs(Pd, (0, -0.02, 0.09), (0.045, 0.028, 0.045))
        rgba = np.stack([sh * (1 + 0.05 * warm), sh * (1 - 0.01 * warm), sh * (1 - 0.02 * warm), np.ones(len(sh))], 1).astype(np.float32)
        me = self.skin.data
        col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col.data.foreach_set('color', rgba.ravel()); me.color_attributes.active_color = col

        P0, C = self.P0, self.centres
        keys = {
            'blinkL': carve_lids(P0, C, shut=(True, False))[0],
            'blinkR': carve_lids(P0, C, shut=(False, True))[0],
            'squint': cheek_raise(carve_lids(P0, C, ku=(0.45, 0.45), kl=(0.92, 0.92))[0], 0.5),
            'smile':  mouth_field(cheek_raise(P, 1.0), 'smile', self.mouth_origin),
            'frown':  mouth_field(P, 'frown', self.mouth_origin),
            'open':   mouth_field(P, 'open', self.mouth_origin),
        }
        for name, Pk in keys.items():
            if not self.skin.data.shape_keys: self.skin.shape_key_add(name='Basis', from_mix=False)
            kb = self.skin.data.shape_keys.key_blocks.get(name) or self.skin.shape_key_add(name=name, from_mix=False)
            kb.data.foreach_set('co', to_bl(Pk).ravel()); kb.value = 0.0

def export_glb(path):
    for ob in coll().objects:
        if ob.type != 'MESH': continue
        role = ob.name.split('_')[0]
        m = bpy.data.materials.get(role) or bpy.data.materials.new(role)
        ob.data.materials.clear(); ob.data.materials.append(m)
    for ob in bpy.context.scene.objects: ob.select_set(ob.name in coll().objects)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    opts = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                export_morph=True, export_morph_normal=False, export_cameras=False, export_lights=False,
                export_texcoords=True, export_normals=True, export_materials='PLACEHOLDER')
    if 'export_meshopt_compression_enable' in bpy.ops.export_scene.gltf.get_rna_type().properties.keys():
        opts['export_meshopt_compression_enable'] = True
    bpy.ops.export_scene.gltf(**opts)
    log('exported', path, f'({os.path.getsize(path) / 1e6:.2f} MB)')

# --------------------------------------------------------------------------- measure & visual comparison
def measure_views():
    """Render orthographic front / side / back of the model at exact turnaround scale (PX=0.00142),
    overlay the reference HIJAB_LINES (red = outer hijab, cyan = face opening / profile), and log mm errors."""
    def mat_c(name, col):
        m = bpy.data.materials.new(name); m.use_nodes = True
        m.diffuse_color = (*col, 1.0)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*col, 1.0); b.inputs['Roughness'].default_value = 0.7
        return m
    m_skin = mat_c('m_skin', (0.22, 0.07, 0.03))
    m_hij  = mat_c('m_hij',  (0.78, 0.60, 0.28))
    m_brow = mat_c('m_brow', (0.02, 0.015, 0.012))
    m_eye  = mat_c('m_eye',  (0.95, 0.95, 0.95))
    for ob in coll().objects:
        if ob.type != 'MESH': continue
        ob.data.materials.clear()
        if ob.name == 'hijab': ob.data.materials.append(m_hij)
        elif ob.name.startswith('brow_'): ob.data.materials.append(m_brow)
        elif ob.name.startswith('eye_'): ob.data.materials.append(m_eye)
        else: ob.data.materials.append(m_skin)

    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys() else 'BLENDER_WORKBENCH'
    W, H = 220, 220
    sc.render.resolution_x = W; sc.render.resolution_y = H
    sc.world = bpy.data.worlds.new('W'); sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.76, 0.76, 0.76, 1.0)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

    # Light
    ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = 2.0
    lo = bpy.data.objects.new('Sun', ld); sc.collection.objects.link(lo); lo.rotation_euler = (0.7, 0.2, 0.4)

    ortho_s = W * PX  # 0.3124 m
    cy = ry_(110.0)    # vertical centre of 220 px crop (v=110)

    def render_ortho(name, loc_t, rot):
        cd = bpy.data.cameras.new(name); cd.type = 'ORTHO'; cd.ortho_scale = ortho_s
        co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co)
        co.location = tuple(to_bl(np.array([loc_t]))[0])
        co.rotation_euler = rot
        sc.camera = co
        p = os.path.join(OUT, f'fit-{name}.png')
        sc.render.filepath = p; bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(p)
        arr = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1, :, :3] * 255.0
        return arr

    # Apply REF_SMILE so we compare smiling model directly against the smiling turnaround sheet
    for ob in coll().objects:
        if ob.type == 'MESH' and ob.data.shape_keys and 'smile' in ob.data.shape_keys.key_blocks:
            ob.data.shape_keys.key_blocks['smile'].value = REF_SMILE

    # Front (+Y look -> -Y in Blender), Left Profile (+X -> -X puts +Z nose on LEFT!), Back (-Y -> +Y)
    z_mid = sz_(100.0)
    a_front = render_ortho('front', (0.0, cy,  1.0), (math.pi / 2, 0, 0))
    a_side  = render_ortho('side',  (1.0, cy, z_mid), (math.pi / 2, 0, math.pi / 2))
    a_back  = render_ortho('back',  (0.0, cy, -1.0), (math.pi / 2, 0, math.pi))

    def draw_pts(arr, pts_uv, col):
        for i in range(len(pts_uv) - 1):
            x0, y0 = pts_uv[i]; x1, y1 = pts_uv[i + 1]
            n = max(abs(x1 - x0), abs(y1 - y0), 1)
            for k in range(int(n) + 1):
                t = k / n
                ix, iy = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
                if 0 <= ix < W and 0 <= iy < H:
                    arr[iy, ix] = col

    # Overlay reference lines in crop px (shift front/back x to W/2=110; side u is already 100-centred -> shift +10)
    RED, CYAN = (255, 40, 40), (0, 235, 255)
    # Front
    f_ov = a_front.copy()
    draw_pts(f_ov, [(110 + d, v) for d, v in HIJAB_LINES['front_outer']], RED)
    draw_pts(f_ov, [(110 - d, v) for d, v in HIJAB_LINES['front_outer']], RED)
    draw_pts(f_ov, [(110 + d, v) for d, v in HIJAB_LINES['front_open']], CYAN)
    draw_pts(f_ov, [(110 - d, v) for d, v in HIJAB_LINES['front_open']], CYAN)
    # Side (u -> u + 10 because camera is at u=100 -> px 110)
    s_ov = a_side.copy()
    draw_pts(s_ov, [(u + 10, v) for u, v in HIJAB_LINES['side_front']], RED)
    draw_pts(s_ov, [(u + 10, v) for u, v in HIJAB_LINES['side_back']], RED)
    draw_pts(s_ov, [(u + 10, v) for u, v in HIJAB_LINES['side_face']], CYAN)
    # Back
    b_ov = a_back.copy()
    draw_pts(b_ov, [(110 + d, v) for d, v in HIJAB_LINES['back_outer']], RED)
    draw_pts(b_ov, [(110 - d, v) for d, v in HIJAB_LINES['back_outer']], RED)

    # Save 3x combined sheet (Front | Side | Back)
    combo = np.concatenate([f_ov, s_ov, b_ov], axis=1)
    combo3 = np.repeat(np.repeat(combo, 3, 0), 3, 1)
    im = bpy.data.images.new('fit_combo', combo3.shape[1], combo3.shape[0], alpha=False)
    im.pixels = np.concatenate([np.clip(combo3[::-1], 0, 255) / 255.0, np.ones((combo3.shape[0], combo3.shape[1], 1))], 2).ravel().tolist()
    im.filepath_raw = os.path.join(OUT, 'fit-combo.png'); im.file_format = 'PNG'; im.save()

    # Measure silhouette width error (model vs reference) at key rows
    for label, arr, ref_fn in (
        ('front', a_front, lambda v: 2.0 * np.interp(v, [r[1] for r in HIJAB_LINES['front_outer']], [r[0] for r in HIJAB_LINES['front_outer']])),
        ('back',  a_back,  lambda v: 2.0 * np.interp(v, [r[1] for r in HIJAB_LINES['back_outer']],  [r[0] for r in HIJAB_LINES['back_outer']])),
    ):
        bg = (np.abs(arr - arr[5, 5]).max(2) < 10)
        fg = ~bg
        errs = []
        for v in range(20, 175, 15):
            xs = np.where(fg[v])[0]
            if len(xs):
                mw = float(xs.max() - xs.min()); rw = float(ref_fn(v))
                errs.append((v, mw * PX * 1000, rw * PX * 1000, (mw - rw) * PX * 1000))
        log(f'{label} width (v, model_mm, ref_mm, diff_mm):', [(v, round(m, 1), round(r, 1), round(d, 1)) for v, m, r, d in errs])

bpy.ops.wm.read_factory_settings(use_empty=True)
b = Builder()
b.all()
if not flag('--no-export'):
    export_glb(os.path.join(ROOT, 'public', 'assets', 'models', 'customer-head.glb'))
if flag('--measure'):
    measure_views()
if flag('--eye-check'):
    ex, ey, ez, nat = b.centres[0]
    log('eye centre:', ex, ey, ez, 'nat:', nat)
    for dy in (-0.010, -0.006, 0.0, 0.006, 0.010):
        sz = b.surface_z(ex, ey + dy)
        cz = ez + math.sqrt(max(0.0, (EYE['R'] * 1.034) ** 2 - dy * dy))
        log(f'  dy={dy:+.3f}: skin_z={sz:.5f}, cornea_z={cz:.5f}, diff={(sz-cz)*1000:+.2f} mm')
LOG.close()
