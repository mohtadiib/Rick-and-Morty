import * as THREE from 'three';
import { makeCanvas, canvasTexture, FONT } from './textures.js';
import { drawBarcode } from './Barcode.js';
import { PRODUCTION } from '../config/production.js';
import { roundRect } from '../core/utils.js';

/** Physical label size (metres): 60 × 40 mm thermal label. */
export const LABEL_W = 0.06;
export const LABEL_H = 0.04;

const texCache = new Map();
/** Label artwork drawn from batch data (medicine, batch, expiry, Code128 barcode). */
export function labelTexture(batch) {
  if (texCache.has(batch.id)) return texCache.get(batch.id);
  const W = 960; const H = 640; const c = makeCanvas(W, H); const g = c.getContext('2d');
  g.fillStyle = '#fdfdfb'; g.fillRect(0, 0, W, H);
  const ink = '#111418';
  // header: medicine name (Latin or Arabic) + Arabic tag
  const isArabic = /[؀-ۿ]/.test(batch.medicine);
  g.fillStyle = ink; g.textBaseline = 'alphabetic';
  g.direction = isArabic ? 'rtl' : 'ltr'; g.textAlign = isArabic ? 'right' : 'left';
  g.font = `800 112px ${FONT()}`;
  g.fillText(batch.medicine, isArabic ? W - 44 : 44, 128);
  if (!isArabic) { g.direction = 'rtl'; g.textAlign = 'right'; g.font = `700 60px ${FONT()}`; g.fillText(batch.medicineAr, W - 44, 116); }
  g.fillRect(40, 156, W - 80, 6);
  // rows
  const row = (y, ar, en, value, big = false) => {
    g.direction = 'rtl'; g.textAlign = 'right'; g.font = `700 50px ${FONT()}`; g.fillText(ar, W - 44, y);
    g.direction = 'ltr'; g.textAlign = 'left'; g.font = `600 34px ${FONT()}`; g.fillText(en, 44, y - 30);
    g.font = `800 ${big ? 66 : 58}px "DejaVu Sans Mono", Menlo, Consolas, monospace`; g.fillText(value, 44, y + 30);
  };
  row(250, 'الدفعة', 'BATCH', batch.batch);
  row(380, 'الانتهاء', 'EXP', batch.expiry, true);
  // status pill
  if (batch.status === 'critical') {
    g.save(); roundRect(g, W - 330, 398, 286, 56, 28); g.fillStyle = ink; g.fill();
    g.fillStyle = '#fff'; g.direction = 'rtl'; g.textAlign = 'center'; g.font = `700 36px ${FONT()}`; g.fillText('صرف أولاً', W - 187, 438); g.restore();
  }
  // barcode (Code 128) of the batch number
  g.fillStyle = '#fff'; g.fillRect(36, 470, W - 72, 150);
  drawBarcode(g, batch.batch, 40, 476, W - 80, 118, ink);
  g.fillStyle = ink; g.direction = 'ltr'; g.textAlign = 'center'; g.font = `600 28px monospace`; g.fillText(batch.batch, W / 2, 624);
  // tiny pharmacy footer
  g.direction = 'rtl'; g.textAlign = 'right'; g.font = `600 26px ${FONT()}`; g.globalAlpha = 0.7; g.fillText(PRODUCTION.pharmacyName, W - 44, 470 - 12); g.globalAlpha = 1;
  const t = canvasTexture(c, { aniso: 16 });
  texCache.set(batch.id, t);
  return t;
}

const labelMat = (batch) => new THREE.MeshStandardMaterial({ map: labelTexture(batch), roughness: 0.55, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const linerMat = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.25, metalness: 0, side: THREE.DoubleSide });

/**
 * A peelable sticker: deformable label + backing liner.
 *   setPeel(p)            – lift the label from its liner starting at one corner (0..1)
 *   setLift(left, right)  – curl both ends up (used while applying / smoothing)
 *   setBubbles(a)         – small air bubbles that get pressed out (0..1)
 * Local frame: label lies in the XY plane, printed side facing +Z, origin at the label centre.
 */
export class Sticker {
  constructor(batch) {
    this.batch = batch;
    this.group = new THREE.Group(); this.group.name = `sticker-${batch.id}`;
    this.geo = new THREE.PlaneGeometry(LABEL_W, LABEL_H, 28, 18);
    this.base = this.geo.attributes.position.array.slice();
    this.mesh = new THREE.Mesh(this.geo, labelMat(batch));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.liner = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W + 0.006, LABEL_H + 0.006), linerMat);
    this.liner.position.z = -0.0004; this.liner.castShadow = true;
    this.group.add(this.liner);
    this.state = { peel: 0, liftL: 0, liftR: 0, bubbles: 0, bend: 0 };
    this._apply();
  }

  set(params) { Object.assign(this.state, params); this._apply(); }

  _apply() {
    const { peel, liftL, liftR, bubbles, bend } = this.state;
    const pos = this.geo.attributes.position; const b = this.base;
    const R = 0.007; // curl radius
    const diag = Math.hypot(LABEL_W, LABEL_H);
    for (let i = 0; i < pos.count; i++) {
      let x = b[i * 3]; let y = b[i * 3 + 1]; let z = 0;
      const u = x / LABEL_W + 0.5; const v = y / LABEL_H + 0.5;
      // corner peel along the diagonal from (u=0, v=0)
      if (peel > 0) {
        const d = ((u * LABEL_W + v * LABEL_H) / diag) * diag; // distance along diagonal (m)
        const front = peel * diag * 1.15;
        const a = front - d;
        if (a > 0) {
          const th = Math.min(a / R, Math.PI * 0.85);
          const arc = R * th;
          const lift = R * (1 - Math.cos(th)) + Math.max(0, a - arc) * Math.sin(th);
          const back = a - (R * Math.sin(th) + Math.max(0, a - arc) * Math.cos(th));
          const dx = LABEL_W / diag; const dy = LABEL_H / diag;
          x += dx * back; y += dy * back; z += lift;
        }
      }
      // end lifts (applying): curl region measured from each end along x
      const curlEnd = (amount, dist) => {
        const a = amount * LABEL_W * 0.55 - dist;
        if (a <= 0) return [0, 0];
        const th = Math.min(a / (R * 1.6), Math.PI * 0.5);
        return [R * 1.6 * (1 - Math.cos(th)), a - R * 1.6 * Math.sin(th)];
      };
      if (liftL > 0) { const [lz, back] = curlEnd(liftL, u * LABEL_W); z += lz; x += back; }
      if (liftR > 0) { const [lz, back] = curlEnd(liftR, (1 - u) * LABEL_W); z += lz; x -= back; }
      // gentle overall bend when held between fingers
      if (bend) z += bend * 0.012 * Math.sin(u * Math.PI) - bend * 0.004;
      // air bubbles
      if (bubbles > 0) {
        const bub = (cx, cy, r) => Math.exp(-(((u - cx) ** 2 + (v - cy) ** 2) / (r * r)));
        z += bubbles * 0.0011 * (bub(0.3, 0.6, 0.09) + bub(0.68, 0.35, 0.07) + 0.7 * bub(0.55, 0.75, 0.06));
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

/** A label already applied on a shelf rail: flat, static. */
export function appliedLabel(batch) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), labelMat(batch));
  m.receiveShadow = true; m.name = `shelf-label-${batch.id}`;
  return m;
}
