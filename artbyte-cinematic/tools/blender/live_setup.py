# Sent by tools/blender/live.mjs into an open Blender: loads the builder as module "ph_head", clears an earlier
# live build, puts the reference face behind the head and frames the front view. Stages then run one by one:
#   node tools/blender/live.mjs code "import sys; m = sys.modules['ph_head']; m.B.skull(); m.preview_materials(); m.live_view()"
import importlib.util, os, sys
import bpy

ROOT = r'D:\Works\Artbyte\videoApp\FluentApp\Farmacy\Rick-and-Morty\artbyte-cinematic'
spec = importlib.util.spec_from_file_location('ph_head', os.path.join(ROOT, 'tools', 'blender', 'pharmacist_head.py'))
m = importlib.util.module_from_spec(spec); sys.modules['ph_head'] = m; spec.loader.exec_module(m)

cube = bpy.data.objects.get('Cube')                       # the factory-startup cube of a fresh window
if cube and cube.type == 'MESH' and len(cube.data.vertices) == 8: bpy.data.objects.remove(cube, do_unlink=True)
m.live_reset()
m.live_reference(os.path.join(ROOT, 'renders', 'blender', 'ref-face.png'))
m.B = m.Builder()
m.live_view()
print('live setup ready')
