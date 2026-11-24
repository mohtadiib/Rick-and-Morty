"""
Side-by-side sheet of images scaled to one height (QA evidence: before / after / reference).

    blender -b --factory-startup --python tools/blender/compare_sheet.py -- <out.jpg> <height> <img1> <img2> ...
"""
import sys
import bpy
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
out, H, paths = a[0], int(a[1]), a[2:]
cols = []
for p in paths:
    im = bpy.data.images.load(p, check_existing=False); w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]          # top-down
    nw = int(round(w * H / h)); yi = (np.arange(H) * h / H).astype(int); xi = (np.arange(nw) * w / nw).astype(int)
    px = px[yi][:, xi]; px[..., 3] = 1
    cols.append(px); cols.append(np.ones((H, 8, 4), dtype=np.float32))            # white gutter
sheet = np.concatenate(cols[:-1], 1)
img = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0])
img.pixels = sheet[::-1].reshape(-1).tolist()
img.filepath_raw = out; img.file_format = 'JPEG'; bpy.context.scene.render.image_settings.quality = 90; img.save()
