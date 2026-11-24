"""
Pharmacist head, authored in Blender (headless):

    blender -b --factory-startup --python tools/blender/pharmacist_head.py -- [--render] [--ref <crop.png>] [--out <dir>] [--cuts N]

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
F = dict(                                  # face sculpt (design space, pre-scale) – FACE_MALE + pharmacist look.face
    rx=0.0805, ry=0.117, rz=0.1, eyeX=0.0330, eyeY=0.0125, jawNarrow=0.10, browRidge=0.0022, socket=0.0078,
    cheek=0.0045, jawAngle=0.004, noseBridge=0.0095, noseDorsum=0.0118, noseTip=0.0142, noseW=1.22, alae=0.0085, muzzle=0.0075,
    chin=0.0075, chinDrop=0.009, lipW=0.0315, noseY=0.006, lowC=0.95, crown=0.0035, socketW=1.18, socketX=1.0,
    socketIn=0.0, lowW=(0.17, 0.03), cheekFull=0.0012, mouthY=-0.0565, chinW=1.6, crownW=0.08, temple=0.0055,
)
# shape vs the reference (front silhouette, tools: --measure): the reference head is the longer one with the wider jaw –
# a lower crown, a longer lower face (lowC), a broad jaw that barely narrows to a wide chin (jawNarrow, lowW, chinW, jawAngle)
# reference eye (2x crop): opening 33.7 x 17.7 mm, upper lid 10 mm above the iris centre, the lower lid just over the iris
EYE = dict(R=0.0215, protrude=0.0075, a=0.0168, Hu=0.0100, Hl=0.0075, lidT=0.0012, clear=0.0009)   # metres, final scale
# hairline (azimuth from the front → design height). The visible hair edge sits ~12.6 mm below these values (where the
# tapered shell leaves the skin); measured with --measure (green line): the reference's high, flat forehead line is at crop
# y ~172 with squared corners at the temples, so the front is ~19 mm higher than the procedural head's
HAIRLINE = [(0, 0.1005), (0.4, 0.1000), (0.62, 0.0985), (0.78, 0.096), (0.86, 0.090), (0.93, 0.075), (1.0, 0.050), (1.08, 0.035),
            (1.15, 0.028), (1.32, 0.030), (1.5, 0.035), (1.75, 0.032), (2.1, 0.018), (2.5, -0.035), (math.pi, -0.07)]
BEARDLINE = [(0, -0.0355), (0.18, -0.0362), (0.33, -0.040), (0.45, -0.0455), (0.56, -0.050), (0.68, -0.055), (0.82, -0.055), (0.95, -0.053),
             (1.08, -0.051), (1.2, -0.050), (1.32, -0.050), (1.48, -0.056), (1.62, -0.075), (1.8, -0.2), (math.pi, -0.3)]
CUBE_CUTS = int(arg("--cuts", 110))       # quads per cube-sphere edge

def sstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0.0, 1.0); return t * t * (3 - 2 * t)
def mix(a, b, t): return a + (b - a) * t
def gs(P, c, r):
    d = (P - np.array(c)) / np.array(r); return np.exp(-(d * d).sum(-1))
def prof(rows, k): return np.interp(k, [r[0] for r in rows], [r[1] for r in rows])

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
    y = np.where(y > 0.05, 0.05 + (y - 0.05) * 0.94, y)
    if F.get('crown'): y = y + F['crown'] * sstep(0.015, 0.1, y)
    if F.get('crownW'): x = x * (1 + F['crownW'] * sstep(0.07, 0.105, y))   # broader, flatter top of the head
    z = np.where(z > 0, z * (1 - 0.07 * sstep(0.035, 0.07, np.abs(x)) * sstep(-0.1, 0.0, y)), z)
    jaw = mix(-0.074, -0.108, sstep(-0.01, 0.075, z)); kk = sstep(0.08, -0.01, z); m = y < jaw
    y = np.where(m, jaw + (y - jaw) * (1 - 0.55 * kk), y); x = np.where(m, x * (1 - 0.18 * kk * sstep(jaw, jaw - 0.03, y)), x)
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
        ala = gs(P, (s * 0.0145 * nw, -0.033 + F['noseY'], 0.09), (0.0088 * nw, 0.0072, 0.04))
        add(2, F['alae'] * ala); add(0, s * F['alae'] * 0.45 * ala)
        add(2, -0.0032 * gs(P, (s * 0.0072 * nw, -0.041 + F['noseY'], 0.105), (0.0034, 0.0022, 0.02)))
        add(2, -0.0022 * gs(P, (s * (F['lipW'] + 0.0048), MY - 0.0002, 0.09), (0.005, 0.006, 0.03)))
    add(2, F['noseBridge'] * gs(P, (0, 0.012, 0.09), (0.0072 * nw, 0.022, 0.04)))
    add(2, F['noseDorsum'] * gs(P, (0, -0.018 + F['noseY'] * 0.6, 0.092), (0.0105 * nw, 0.021, 0.04)))
    add(2, F['noseTip'] * gs(P, (0, -0.031 + F['noseY'], 0.1), (0.0125 * nw, 0.0105, 0.04)))
    add(1, -0.0025 * gs(P, (0, -0.034 + F['noseY'], 0.11), (0.01, 0.006, 0.02)))
    lw = max(1, F['lipW'] / 0.0212)
    add(2, F['muzzle'] * gs(P, (0, MY - 0.0002, 0.085), (0.03 * lw, 0.022, 0.04)))
    add(2, -0.0012 * gs(P, (0, MY + 0.0128, 0.1), (0.0035, 0.006, 0.02)))
    add(2, -0.0026 * gs(P, (0, MY, 0.1), (0.023 * lw, 0.0062, 0.02)))
    add(2, F['chin'] * gs(P, (0, -0.1, 0.07), (0.022 * F['chinW'], 0.016, 0.04)))
    if F.get('cheekFull'):
        for s in (1, -1):
            add(0, s * F['cheekFull'] * gs(P, (s * 0.06, -0.035, 0.045), (0.02, 0.026, 0.035)))
            add(2, F['cheekFull'] * 0.6 * gs(P, (s * 0.045, -0.03, 0.07), (0.02, 0.022, 0.03)))
    add(1, -F['chinDrop'] * gs(P, (0, -0.105, 0.06), (0.026, 0.014, 0.04)))
    return P

def warp_face(P, F):
    P = P.copy(); d = F['eyeY'] - P[:, 1]; m = d > 0
    P[:, 1] = np.where(m, F['eyeY'] - d * (1 - F['lowC'] * d * sstep(-0.045, 0.03, P[:, 2])), P[:, 1])
    return P

def skull_points(D, F):
    P0 = np.stack([D[:, 0] * F['rx'], D[:, 1] * F['ry'], D[:, 2] * F['rz']], 1)
    Pd = sculpt(P0, F)                       # design space (masks are authored here)
    return warp_face(Pd, F) * HS, Pd

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
def eye_centres(P, bvh):
    out = []
    for s in (1, -1):
        ex, ey = s * F['eyeX'] * HS, F['eyeY'] * HS
        hit = bvh.ray_cast(Vector((ex, -0.6, ey)), Vector((0, 1, 0)))        # Blender: face looks toward -y
        nat = -hit[0].y if hit[0] is not None else 0.09
        out.append((ex, ey, nat + EYE['protrude'] - EYE['R'], nat))
    return out

def carve_lids(P, centres, Hus=None, Hls=None):
    """Lids of both eyes carved into the skin: skin draped over the eyeball sphere, with an almond opening.
    Hus/Hls = per-eye upper/lower margin heights (Hu < -Hl closes the eye). Returns (P, shade) – shade is a per-vertex
    colour multiplier (dark lash line on the lid margin, slightly darker lid skin)."""
    P = P.copy(); R, a = EYE['R'], EYE['a']; shade = np.ones(len(P))
    Hus = Hus or [EYE['Hu']] * len(centres); Hls = Hls or [EYE['Hl']] * len(centres)
    for (ex, ey, ez, nat0), Hu, Hl in zip(centres, Hus, Hls):
        dx, dy = P[:, 0] - ex, P[:, 1] - ey; r2 = dx * dx + dy * dy
        m = (P[:, 2] > 0.03) & (r2 < (R * 1.25) ** 2)
        if not m.any(): continue
        tt = np.clip(1 - (dx[m] / a) ** 2, 0, 1) ** 0.6
        dv = np.maximum(dy[m] - Hu * tt, -dy[m] - Hl * tt); dh = np.abs(dx[m]) - a
        d = np.maximum(dv, dh)
        inside_sph = r2[m] < R * R
        sph = ez + np.sqrt(np.maximum(R * R - r2[m], 0)); nat = P[m, 2]
        bump = EYE['lidT'] * np.exp(-(np.maximum(d, 0) / 0.0022) ** 2)
        lid = np.where(inside_sph, np.maximum(nat, sph + EYE['clear'] + bump), nat); ap = np.where(inside_sph, np.minimum(nat, sph - 0.0007), nat)
        win = sstep(0.0004, -0.0004, d)
        z = lid * (1 - win) + ap * win
        if Hu < -Hl:                                                    # closed: a thin groove where the lashes meet
            z = z - 0.0005 * np.exp(-((dy[m] + 0.0040 * tt) / 0.0011) ** 2) * (tt > 0.05)
        P[m, 2] = z
        lash = np.exp(-((d - 0.0001) / 0.00075) ** 2)
        s_ = 1 - np.where(dy[m] > -0.0015, 0.8, 0.45) * lash * (tt > 0.02)
        s_ = s_ * (1 - 0.12 * np.exp(-(np.maximum(d, 0) / 0.004) ** 2) * (d > 0))
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
    """Port of HeroHead._buildEars: flattened ellipsoid with a dished concha and a rolled rim, placed by E (design units)."""
    NU, NV = 28, 24; verts, faces = [], []
    for j in range(NV + 1):
        for i in range(NU + 1):
            th = i / NU * 2 * math.pi; ph = (j / NV - 0.5) * math.pi
            x = math.cos(ph) * math.cos(th) * 0.0085; y = math.sin(ph) * 0.031; z = math.cos(ph) * math.sin(th) * 0.0185
            rim = math.cos(ph) * abs(math.cos(th))
            if math.cos(th) > 0: x -= 0.0075 * rim ** 3 * float(sstep(-0.028, -0.005, y)) * (1 - 0.4 * float(sstep(0.0, 0.03, y)))
            if y < 0: z += 0.003 * float(sstep(-0.031, -0.02, y))
            verts.append((x, y, z))
    for j in range(NV):
        for i in range(NU):
            a = j * (NU + 1) + i; f = [a, a + 1, a + NU + 2, a + NU + 1]
            faces.append(f[::-1] if s > 0 else f)                       # outward normals (the s < 0 copy is mirrored)
    V = np.array(verts) * np.array([1.15 * E['scale'], 1.2 * E['scale'] * E['sy'], 1.2 * E['scale']])
    if s < 0: V[:, 0] *= -1                                             # mirror first, then rotate (as three.js: scale before rotation)
    rz, ry = s * -0.06, s * E['rot']                                  # three.js Euler XYZ (0, ry, rz): Rz first, then Ry
    c, sn = math.cos(rz), math.sin(rz); V = np.stack([V[:, 0] * c - V[:, 1] * sn, V[:, 0] * sn + V[:, 1] * c, V[:, 2]], 1)
    c, sn = math.cos(ry), math.sin(ry); V = np.stack([V[:, 0] * c + V[:, 2] * sn, V[:, 1], -V[:, 0] * sn + V[:, 2] * c], 1)
    V += np.array([s * (F['rx'] - E['inset']), E['y'], E['z']])
    return make_object('ear_L' if s > 0 else 'ear_R', V * HS, faces)

# --------------------------------------------------------------------------- brows, hair, beard, glasses
def brows(skin_bvh_z):
    pts = [(357, 306), (330, 296), (298, 292), (265, 300), (237, 318)]; wid = [0.0033, 0.0035, 0.0031, 0.0021, 0.0009]
    C = np.array([(rx_(x), ry_(y)) for x, y in pts]); W = np.array(wid)
    t = np.linspace(0, 1, 40); idx = np.linspace(0, len(C) - 1, 40)
    cx = np.interp(idx, range(len(C)), C[:, 0]); cy = np.interp(idx, range(len(C)), C[:, 1]); w = np.interp(idx, range(len(C)), W)
    tan = np.stack([np.gradient(cx), np.gradient(cy)], 1); tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1); K = 9; objs = []
    for s in (1, -1):                       # reference crop: viewer-left brow has x < 0
        verts, faces = [], []
        for i in range(len(cx)):
            for k in range(K):
                a = k / (K - 1) * 2 - 1
                x = cx[i] + nrm[i, 0] * a * w[i]; y = cy[i] + nrm[i, 1] * a * w[i]
                z = skin_bvh_z(-x if s > 0 else x, y) + 0.0006 + 0.0013 * math.sqrt(max(0, 1 - a * a)) * (w[i] / 0.003)
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
    # grain: a fixed few-mm jitter (relative jitter made long spikes where the beard is thick, under the chin)
    tk = thick * (mask ** 0.55) + noise_amp * 0.004 * (jit - 0.5) * sstep(0.0, 0.25, mask) - 0.0012 * (1 - sstep(0.0, 0.25, mask))
    offs = nrm[keepidx] * tk[keepidx, None]
    ob = make_object(name, P[keepidx] + offs, nf, spherical_uv(P[keepidx]))
    ob['_keep'] = len(keepidx)
    return ob, keepidx, offs      # a deformed skin Pk gives the matching shell positions Pk[keepidx] + offs (shape keys)

def masks(Pd):
    az = np.abs(np.arctan2(Pd[:, 0], Pd[:, 2])); x, y, z = Pd[:, 0], Pd[:, 1], Pd[:, 2]
    hb = prof(HAIRLINE, az); hair = sstep(hb - 0.0135, hb - 0.0035, y)   # crisp: full thickness within 1 cm of the visible edge
    bb = prof(BEARDLINE, az); jaw = mix(-0.074, -0.108, sstep(-0.01, 0.075, z))
    under = sstep(jaw - BEARD['under'][0], jaw - BEARD['under'][1], y)   # the reference beard wraps under the chin
    up, dn, hw = MOUTH_HOLE        # shaved skin around the lips: the moustache sits on the upper lip in the reference
    dy = y - F['mouthY']   # boxy oval (superellipse, p = 3): the reference's shaved patch reaches out round the mouth corners
    pe = np.where(dy > 0, 2.0, 3.0)   # rounded above: the moustache comes down over the mouth corners (reference)
    e = (np.abs(x / (hw * max(1, F['lipW'] / 0.0212))) ** pe + np.abs(dy / np.where(dy > 0, up, dn)) ** pe) ** (1 / pe)
    beard = sstep(bb + 0.003, bb - 0.004, y) * sstep(0.86, 1.18, e) * sstep(-0.012, 0.004, z + 0.02) * under
    for s in (1, -1):
        # shaved lobes under the lower lip either side of the soul patch, which starts narrow under the lip and widens
        # down into the chin beard (reference): each lobe = a small ellipse by the lip + a taller one further out and down
        for sx, sdy, srx, sry in SOUL:
            soul = np.hypot((x - s * sx) / srx, (y - F['mouthY'] - sdy) / sry); beard = beard * sstep(0.8, 1.15, soul)
    return hair, beard

def glasses(surface_z):
    # reference (2x crop): near-round lenses 62 x 50 mm, centres +-40 mm, an 18 mm bridge, 2.9 mm dark acetate rims
    n, a, b = 2.2, 0.031, 0.025; rim = 0.00145; objs = []
    cy = 0.0095; LX = 0.0404
    def edge_x(dy): return a * max(0.0, 1 - abs(dy / b) ** n) ** (1 / n)      # half-width of the lens at height dy
    th = np.linspace(0, 2 * math.pi, 96, endpoint=False)
    sx = np.sign(np.cos(th)) * np.abs(np.cos(th)) ** (2 / n) * a; sy = np.sign(np.sin(th)) * np.abs(np.sin(th)) ** (2 / n) * b
    # lens plane: just in front of the highest skin point under the rims (brow, cheek, nose root)
    zc = max(surface_z(s * LX + u, cy + v) for s in (1, -1) for u, v in zip(sx[::4], sy[::4])) + 0.006
    for s in (1, -1):
        cx = s * LX
        curve = bpy.data.curves.new('rim', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = rim; curve.bevel_resolution = 4
        sp = curve.splines.new('POLY'); sp.points.add(len(th) - 1); sp.use_cyclic_u = True
        for i, (u, v) in enumerate(zip(sx, sy)):
            sp.points[i].co = (cx + u, -zc, cy + v, 1)           # Blender axes: -y is forward
        ob = bpy.data.objects.new('rim_L' if s > 0 else 'rim_R', curve); coll().objects.link(ob); objs.append(ob)
        # lens: flat fan just behind the rim's centre line (the rig gives it a faint reflective material)
        ring = np.stack([cx + sx * 0.985, cy + sy * 0.985, np.full(len(th), zc - 0.0003)], 1)
        V = np.vstack([[cx, cy, zc - 0.0003], ring]); n = len(th)
        fl = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]
        lens = make_object('lens_L' if s > 0 else 'lens_R', V, fl); objs.append(lens)
    # bridge + temple arms
    curve = bpy.data.curves.new('frame', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = rim; curve.bevel_resolution = 4
    xb = LX - edge_x(0.014) * 0.98
    bridge = [(-xb, -zc, cy + 0.0140), (-0.006, -zc - 0.0012, cy + 0.0155), (0.006, -zc - 0.0012, cy + 0.0155), (xb, -zc, cy + 0.0140)]
    sp = curve.splines.new('POLY'); sp.points.add(len(bridge) - 1)
    for i, p in enumerate(bridge): sp.points[i].co = (*p, 1)
    for s in (1, -1):
        # temple arms run straight back into the hair at the temples (reference), not out past the head
        xo = LX + edge_x(0.0118) * 0.98                                   # end piece out to the hinge, then back into the hair
        arm = [(s * xo, -zc, cy + 0.0118), (s * 0.0795, -zc + 0.004, cy + 0.0118), (s * 0.0815, -0.05, cy + 0.0110),
               (s * 0.0830, -0.02, cy + 0.0090), (s * 0.0840, 0.02, cy + 0.0040)]
        sp = curve.splines.new('POLY'); sp.points.add(len(arm) - 1)
        for i, p in enumerate(arm): sp.points[i].co = (*p, 1)
    ob = bpy.data.objects.new('frame', curve); coll().objects.link(ob); objs.append(ob)
    return objs

# --------------------------------------------------------------------------- build
EAR = dict(scale=1.1, sy=0.74, y=-0.0095, z=-0.008, inset=0.009, rot=-0.6)     # reference: ears span the eye line to the nose base
# lips (design units, as the rig's mouth): the reference smiles with the upper teeth showing → a smile opens the lips a little
# reference smile: corners well up (crescent), the upper teeth showing (~4 mm parted at the rest smile), full lower lip
# reference mouth (2x crop, same scale as our portrait): upper lip a 7 mm band across the whole mouth, lower lip 13 mm
# but only ~83 % as wide, a thin (~3 mm) row of upper teeth, corners ~6 mm above the centre at the rest smile
MOUTH = dict(smileW=0.16, smileCurve=0.0093, smileOpen=0.0036, lipU=0.0095, lipL=0.0128, bulgeU=0.0045, bulgeL=0.0058, teeth=0.006,
             upperProfile=0.2, lowerProfile=1.6)   # owner: upper lip taller and wider (full height to the corners), lower narrower
SOUL = ((0.0205, -0.0205, 0.0110, 0.0080), (0.0160, -0.0310, 0.0105, 0.0075))   # lobes slant inwards down to the chin (reference)   # lobes: x, y below the mouth line, radii (design)
MOUTH_HOLE = (0.0125, 0.0148, 0.0245)   # beard opening around the mouth: up, down, half-width (design units)
BEARD = dict(t=0.0042, chin=0.011, jaw=0.006, corner=0.014, under=(0.042, 0.018))   # thickness, extra at chin / jaw sides, cover below the jaw (design units)

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
        Q[:, 1] += cy * u * u * near * S
        Q[:, 0] += np.sign(xr) * (W1 - W0) * u * near * S
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
        self.P0, self.Pd = skull_points(D, F); self.P = self.P0
        self.skin = make_object('skin', self.P0, self.faces, spherical_uv(self.P0)); self._bvh()
        col = self.skin.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')   # neutral until skin_detail paints it
        col.data.foreach_set('color', np.ones(len(self.P0) * 4, dtype=np.float32)); self.skin.data.color_attributes.active_color = col
        log('skin verts', len(self.P0), 'faces', len(self.faces))

    def eyes(self):
        """Eyeballs set into the sockets; the lids are carved into the skin around them."""
        self.centres = []
        for s in (1, -1):
            ex, ey = s * F['eyeX'] * HS, F['eyeY'] * HS; nat = self.surface_z(ex, ey)
            self.centres.append((ex, ey, nat + EYE['protrude'] - EYE['R'], nat))
        self.P, self.lid_shade = carve_lids(self.P0, self.centres)
        self.skin.data.vertices.foreach_set('co', to_bl(self.P).ravel()); self.skin.data.update(); self._bvh()
        tex = eye_material()
        for (ex, ey, ez, _), nm in zip(self.centres, ('eye_L', 'eye_R')): eyeball(nm, (ex, ey, ez), EYE['R'], tex)
        log('eye centres', [tuple(round(v, 5) for v in c[:3]) for c in self.centres])

    def ears(self):
        for s in (1, -1): ear_mesh(s, EAR)

    def brows(self): brows(self.surface_z)

    def hair(self):
        self.hair_m, self.beard_m = masks(self.Pd)
        # short faded sides, fuller on top (reference)
        t = (0.0018 + 0.0068 * sstep(0.03, 0.09, self.Pd[:, 1])) * np.where(self.Pd[:, 2] < -0.04, 0.75, 1.0) * HS
        shell('hair', self.skin, self.P, self.Pd, self.hair_m, t, 0.3, 1)

    def beard(self):
        """Full beard: fuller towards the chin and under it, so its outline drops below the jaw as in the reference."""
        x, y, z = self.Pd[:, 0], self.Pd[:, 1], self.Pd[:, 2]
        t = (BEARD['t'] + BEARD['chin'] * sstep(-0.07, -0.11, y) * sstep(-0.01, 0.05, z)
             + BEARD['jaw'] * sstep(-0.06, -0.095, y) * sstep(0.015, 0.045, np.abs(x))
             + BEARD['corner'] * sstep(-0.085, -0.11, y) * sstep(0.008, 0.03, np.abs(x)) * sstep(-0.01, 0.04, z)) * HS   # broad, flat chin bottom     # squarer: fuller at the lower jaw corners
        self.beard_shell = shell('beard', self.skin, self.P, self.Pd, self.beard_m, t, 0.5, 2)

    def glasses(self): glasses(self.surface_z)

    def lips(self):
        """Upper / lower lip, teeth and mouth interior resting on the skin (port of HeroHead._setMouth, in final units),
        with shape keys smile, frown and open – the rig blends them for smiles and speech."""
        S = HS; MYw = warp_face(np.array([[0.0, F['mouthY'], 0.09]]), F)[0, 1]
        oy = MYw * S; z0 = self.surface_z(0.0, oy); oz = z0 + 0.0006 * S
        xs = max(0.022, F['lipW']) * S; k = (z0 - self.surface_z(xs, oy)) / (xs * xs)       # mouth-plane curvature
        NX, NT = 28, 6; M = MOUTH
        t = np.linspace(-1, 1, NX + 1)
        def skin_dz(x, y): return np.array([self.surface_z(a, oy + b) - oz for a, b in zip(x, y)])
        def geo(smile, open_):
            sp = max(0.0, smile); W = F['lipW'] * (1 + M['smileW'] * sp - 0.04 * max(0.0, -smile))
            cy = M['smileCurve'] * smile if smile >= 0 else 0.0038 * smile
            O = open_ * 0.0115 + sp * M['smileOpen']                 # linear in smile: the morph blends it exactly
            t2 = t * t; one = np.clip(1 - t2, 0, 1)
            yU = O * 0.28 * one + cy * t2; yL = -O * 0.72 * one ** 0.8 + cy * t2
            # upper lip stays full out to the corners; the lower lip tapers sooner, so it reads narrower than the upper one
            thU = M['lipU'] * one ** M['upperProfile'] - 0.0007 * np.exp(-(t / 0.1) ** 2) + 0.0004 * np.exp(-((np.abs(t) - 0.24) / 0.1) ** 2)
            thL = M['lipL'] * one ** M['lowerProfile']
            x = t * W
            def fill(yIn, yOut, bulge, innerTop):
                rows = []
                for j in range(NT + 1):
                    tau = j / NT; y = mix(yIn, yOut, tau); b = bulge * np.sqrt(one)
                    tuck = tau if innerTop else 1 - tau
                    base = skin_dz(x * S, y * S) / S
                    z = base + b * np.sin(math.pi * tau) ** 0.7 - 0.0014 * tuck * tuck
                    rows.append(np.stack([x, y, z], 1))
                return np.concatenate(rows)
            def flat(top, bottom, zoff):
                zf = -k * (x * S) ** 2 / S
                return np.concatenate([np.stack([x, bottom, zf + zoff], 1), np.stack([x, top, zf + zoff], 1)])
            th = M["teeth"]; ul = np.abs(t) < 0.78
            return {
                'lip_U': fill(yU, yU + thU, M['bulgeU'], False),
                'lip_L': fill(yL - thL, yL, M['bulgeL'], True),
                'mouth': flat(yU, yL, 0.0003),
                'teeth': flat(np.where(ul, yU, yL), np.where(ul, np.maximum(yU - th, yL), yL), 0.0007),
            }
        def grid(nr):
            return [[j * (NX + 1) + i, j * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i] for j in range(nr) for i in range(NX)]
        origin = np.array([0.0, oy, oz]); self.mouth_origin = origin
        rest, keys = geo(0, 0), {'smile': geo(1, 0), 'frown': geo(-1, 0), 'open': geo(0, 1)}
        for name, V in rest.items():
            ob = make_object(name, V * S + origin, grid(NT if name.startswith('lip') else 1))
            ob.shape_key_add(name='Basis', from_mix=False)
            for kn, G in keys.items():
                kb = ob.shape_key_add(name=kn, from_mix=False); kb.data.foreach_set('co', to_bl(G[name] * S + origin).ravel()); kb.value = 0.0

    def skin_detail(self):
        """Vertex colour (a multiplier on the skin tone) and the expression shape keys."""
        P, Pd = self.P, self.Pd
        sh = self.lid_shade * (1 - 0.42 * sstep(0.0, 0.7, self.beard_m)) * (1 - 0.30 * sstep(0.0, 0.8, self.hair_m))
        for c in self.centres: sh *= 1 - 0.07 * gs(P, (c[0], c[1] + 0.002, c[3]), (0.024, 0.016, 0.03))
        for s in (1, -1): sh *= 1 - 0.55 * gs(Pd, (s * 0.0072 * F['noseW'], -0.041 + F['noseY'], 0.105), (0.0034, 0.0022, 0.02))
        warm = gs(Pd, (0, -0.02, 0.1), (0.05, 0.03, 0.05))
        # skin around the lips takes on the lip colour (blends into the rig's lip meshes), as the procedural head's map did
        lip = 0.5 * gs(Pd, (0, F['mouthY'], 0.1), (0.022, 0.0075, 0.03)); ratio = np.array(srgb_to_lin(0x7a4134)) / np.array(srgb_to_lin(0x7a4a31))
        tint = [1 + (ratio[i] - 1) * lip for i in range(3)]
        rgba = np.stack([sh * (1 + 0.06 * warm) * tint[0], sh * (1 - 0.02 * warm) * tint[1], sh * tint[2], np.ones(len(sh))], 1).astype(np.float32)
        me = self.skin.data
        col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col.data.foreach_set('color', rgba.ravel()); me.color_attributes.active_color = col
        Hu, Hl = EYE['Hu'], EYE['Hl']; shut = -Hl - 0.0005; P0, C = self.P0, self.centres
        keys = {
            'blinkL': carve_lids(P0, C, [shut, Hu], [Hl, Hl])[0],
            'blinkR': carve_lids(P0, C, [Hu, shut], [Hl, Hl])[0],
            'squint': cheek_raise(carve_lids(P0, C, [0.0030, 0.0030], [0.0052, 0.0052])[0], 0.5),
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
                export_cameras=False, export_lights=False, export_texcoords=True, export_normals=True, export_materials='PLACEHOLDER')
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

def eye_material():
    W, H = 512, 256; img = bpy.data.images.new('eye_tex', W, H)
    j, i = np.mgrid[0:H, 0:W]; v = (j + 0.5) / H; u = (i + 0.5) / W; phi = (1 - v) * math.pi; th = u * 2 * math.pi
    R_I = 0.395; col = np.zeros((H, W, 4), dtype=np.float32); col[..., 3] = 1
    sclera = np.array([0.92, 0.90, 0.88]); iris = np.array(srgb_to_lin(0x4a2412)); fibre = 0.65 + 0.35 * np.sin(th * 48) * 0.5 + 0.1 * np.sin(th * 17)
    col[..., :3] = sclera
    inside = phi < R_I
    ic = iris[None, None, :] * (0.55 + 0.9 * (phi / R_I))[..., None] * fibre[..., None]
    col[..., :3] = np.where(inside[..., None], ic, col[..., :3])
    ring = (phi > R_I * 0.82) & inside; col[..., :3] = np.where(ring[..., None], col[..., :3] * 0.35, col[..., :3])
    pup = phi < 0.165; col[..., :3] = np.where(pup[..., None], 0.005, col[..., :3])
    img.pixels = col.reshape(-1).tolist()
    m = bpy.data.materials.new('eye'); m.use_nodes = True; nt = m.node_tree
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.12; nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
    return m

def preview_materials():
    skin_m = mat('pv_skin', 0x7a4a31, 0.5, 0.15); dark = mat('pv_hair', 0x151313, 0.65); brow_m = mat('pv_brow', 0x17120f, 0.7)
    frame_m = mat('pv_frame', 0x211c1a, 0.3); ear_m = mat('pv_ear', 0x84513a, 0.5); lens_m = mat('pv_lens', 0xffffff, 0.05)
    lb = lens_m.node_tree.nodes['Principled BSDF']; lb.inputs['Alpha'].default_value = 0.06
    if hasattr(lens_m, 'surface_render_method'): lens_m.surface_render_method = 'BLENDED'   # no dithering noise in the viewport
    lip_m = mat('pv_lips', 0x7a4134, 0.42); teeth_m = mat('pv_teeth', 0xece6da, 0.3); inner_m = mat('pv_mouth', 0x2a0d0b, 0.9)
    nt = skin_m.node_tree; vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    mul.inputs['A'].default_value = (*srgb_to_lin(0x7a4a31), 1)
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
    w_ = bpy.data.worlds.new('w'); w_.use_nodes = True; w_.node_tree.nodes['Background'].inputs['Color'].default_value = (0.7, 0.7, 0.72, 1)
    w_.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8; sc.world = w_
    for name, loc, e in (('key', (-0.5, -0.8, 0.5), 60), ('fill', (0.6, -0.7, 0.1), 25)):
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

if __name__ == '__main__':
    try:
        skin = build()
        if '--measure' in ARGS: measure(arg('--ref'))
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
        for kb in (skin.data.shape_keys.key_blocks if skin.data.shape_keys else []): kb.value = 0.0
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'pharmacist_head.blend'))
        if '--no-export' not in ARGS:
            export_glb(os.path.join(ROOT, 'public', 'assets', 'models', 'pharmacist-head.glb'))
        log('done')
    except Exception:
        import traceback; log(traceback.format_exc()); raise
