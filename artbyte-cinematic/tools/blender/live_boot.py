"""
Startup script for a live Blender GUI session (launched via tools/blender/open_live.ps1):
enables the local MCP for Blender add-on (renders/blender/user_scripts/addons/blender_mcp.py)
with telemetry off and starts its socket server on localhost:9876 so tools/blender/live.mjs
can build and edit the pharmacist head live in the viewport.
"""
import importlib.util, os, sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ADDON_PATH = os.path.join(ROOT, 'renders', 'blender', 'user_scripts', 'addons', 'blender_mcp.py')

def _start_mcp():
    try:
        # Try enabling via Blender's addon registry first (when BLENDER_USER_SCRIPTS is set)
        try:
            bpy.ops.preferences.addon_enable(module='blender_mcp')
        except Exception:
            if os.path.exists(ADDON_PATH):
                spec = importlib.util.spec_from_file_location('blender_mcp', ADDON_PATH)
                mod = importlib.util.module_from_spec(spec)
                sys.modules['blender_mcp'] = mod
                spec.loader.exec_module(mod)
                mod.register()
        # Keep telemetry off
        prefs = bpy.context.preferences.addons.get('blender_mcp')
        if prefs and hasattr(prefs.preferences, 'telemetry_consent'):
            prefs.preferences.telemetry_consent = False
        # Start the localhost:9876 MCP socket server
        if hasattr(bpy.ops, 'blendermcp') and hasattr(bpy.ops.blendermcp, 'start_server'):
            bpy.ops.blendermcp.start_server()
            print('[live_boot] MCP for Blender server started on localhost:9876')
    except Exception as exc:
        import traceback
        print('[live_boot] failed to start MCP server:', exc)
        traceback.print_exc()
    return None

bpy.app.timers.register(_start_mcp, first_interval=0.8)
