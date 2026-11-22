import { PRODUCTION } from '../config/production.js';

/**
 * On-screen Arabic typography (DOM layer above the WebGL canvas → perfect shaping & RTL).
 * Supers are deterministic: opacity/offset are computed from the timeline each frame.
 * Styles: 'lower' (lower third), 'center', 'chip' (anchored to a 3D point), 'end' (brand card).
 */
export class OverlayLayer {
  constructor(root) {
    this.root = root; this.pool = new Map(); this.used = new Set();
    root.style.fontFamily = PRODUCTION.typography.family;
  }
  begin() { this.used.clear(); }
  /** item: { id, html|text, sub, style, opacity, x, y, scale, className } */
  put(item) {
    let el = this.pool.get(item.id);
    if (!el) { el = document.createElement('div'); el.className = 'ov'; this.root.appendChild(el); this.pool.set(item.id, el); el._key = ''; }
    const key = `${item.style}|${item.text}|${item.sub || ''}|${item.html || ''}`;
    if (el._key !== key) {
      el._key = key; el.className = `ov ov-${item.style}${item.className ? ' ' + item.className : ''}`;
      if (item.html) el.innerHTML = item.html;
      else el.innerHTML = `<div class="ov-main">${escapeHtml(item.text)}</div>${item.sub ? `<div class="ov-sub">${escapeHtml(item.sub)}</div>` : ''}`;
    }
    el.style.opacity = String(item.opacity ?? 1);
    const tx = item.x != null ? `left:${(item.x * 100).toFixed(3)}%;top:${(item.y * 100).toFixed(3)}%;` : '';
    const tr = `transform: translate(${item.style === 'chip' ? '-50%,-120%' : '0,0'}) translateX(${(item.dx || 0).toFixed(1)}px) translateY(${(item.dy || 0).toFixed(1)}px) scale(${item.scale ?? 1});`;
    el.setAttribute('style', `${tx}${tr}opacity:${(item.opacity ?? 1).toFixed(3)};${item.css || ''}`);
    el.style.display = (item.opacity ?? 1) <= 0.001 ? 'none' : '';
    this.used.add(item.id);
  }
  end() { this.pool.forEach((el, id) => { if (!this.used.has(id)) el.style.display = 'none'; }); }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
