/**
 * Drive an open Blender through the "MCP for Blender" add-on socket (the same channel its MCP server uses).
 * Start the server in Blender first: 3D Viewport ▸ N ▸ MCP for Blender ▸ Connect (listens on localhost:9876).
 *
 *   node tools/blender/live.mjs ping
 *   node tools/blender/live.mjs exec <file.py>            run a Python file inside the open Blender
 *   node tools/blender/live.mjs code "<python>"           run a Python snippet
 *   node tools/blender/live.mjs shot <out.png> [size]     save a viewport screenshot
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [cmd, a1, a2] = process.argv.slice(2);
const PORT = +(process.env.BLENDER_MCP_PORT || 9876);

function send(command, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port: PORT });
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timeout waiting for Blender')); }, timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify(command)));
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      try { const r = JSON.parse(buf); clearTimeout(timer); sock.end(); resolve(r); } catch { /* incomplete */ }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

let command;
if (cmd === 'ping') command = { type: 'ping' };
else if (cmd === 'exec') command = { type: 'execute_code', params: { code: fs.readFileSync(a1, 'utf8') } };
else if (cmd === 'code') command = { type: 'execute_code', params: { code: a1 } };
else if (cmd === 'shot') command = { type: 'get_viewport_screenshot', params: { filepath: path.resolve(a1), max_size: +(a2 || 1000), format: 'png' } };
else { console.error('usage: live.mjs ping | exec <file.py> | code "<python>" | shot <out.png> [size]'); process.exit(2); }

try {
  const r = await send(command);
  if (r.status === 'error') { console.error('blender error:', r.message || JSON.stringify(r)); process.exit(1); }
  const res = r.result ?? r;
  console.log(typeof res === 'string' ? res : (res.result ?? JSON.stringify(res)));
} catch (e) {
  console.error(e.code === 'ECONNREFUSED' ? `Blender is not listening on ${PORT}: press Connect in the MCP for Blender panel (N sidebar).` : e.message);
  process.exit(1);
}
