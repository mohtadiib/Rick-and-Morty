import * as THREE from 'three';
import { LightingManager, MOODS } from './LightingManager.js';
import { CameraDirector } from './CameraManager.js';
import { PharmacyEnvironment, LAYOUT } from '../environments/PharmacyEnvironment.js';
import { PharmacyCounter } from '../environments/PharmacyCounter.js';
import { PharmacistDesk } from '../environments/PharmacistDesk.js';
import { OfficeEnvironment } from '../environments/OfficeEnvironment.js';
import { createPharmacist } from '../characters/Pharmacist.js';
import { createCustomer } from '../characters/Customer.js';
import { createArtByteEmployee } from '../characters/ArtByteEmployee.js';
import { HeroMedicineBox, PRODUCTS } from '../objects/MedicineBox.js';
import { Laptop, Smartphone, Tablet, createEquipmentCase } from '../objects/Devices.js';
import { Sticker, appliedLabel } from '../objects/BatchLabel.js';
import { Agreement, createPen, createSheet } from '../objects/Documents.js';
import { ScreenManager } from '../ui/ScreenManager.js';
import { LABEL_BATCHES, SEARCH_BOXES } from '../config/storyData.js';
import { LOOKS } from '../effects/ColorGrading.js';
import { SHELF_FRONT_Z } from '../environments/PharmacyShelves.js';

/**
 * The single, persistent world shared by every scene (continuity by construction):
 * one pharmacy, one pharmacist, one customer, one ArtByte team, one printer.
 *
 * beginFrame() restores every dynamic element to its neutral state; the active scene then poses
 * what it needs. That makes each frame independent of playback history (exact seeking).
 */
export class World {
  constructor(renderer, assets) {
    this.renderer = renderer; this.assets = assets;
    const scene = (this.scene = renderer.scene);
    this.lighting = new LightingManager(scene, renderer);
    this.director = new CameraDirector(renderer.camera, renderer);

    this.pharmacy = new PharmacyEnvironment(this.lighting);
    this.lighting.environment = this.pharmacy;
    scene.add(this.pharmacy.group);
    this.counter = new PharmacyCounter(this.pharmacy.mats); scene.add(this.counter.group);
    this.desk = new PharmacistDesk(this.lighting); scene.add(this.desk.group);
    this.home = new OfficeEnvironment(this.lighting); scene.add(this.home.group);
    this.printer = this.desk.printer;
    this.monitor = this.desk.monitor;

    // ---- cast ----
    this.pharmacist = createPharmacist();
    this.customer = createCustomer();
    this.team = [0, 1, 2].map((i) => createArtByteEmployee(i, assets.logoTexture));
    this.characters = [this.pharmacist, this.customer, ...this.team];
    this.characters.forEach((c) => scene.add(c.root));

    // ---- devices & screens ----
    this.screens = new ScreenManager(assets);
    this.laptop = new Laptop(); scene.add(this.laptop.group);
    this.phone = new Smartphone(); scene.add(this.phone.group);
    this.tablet = new Tablet(); scene.add(this.tablet.group);
    this.screens.register('monitor', this.monitor.screen, { width: 1700, kind: 'desktop' });
    this.screens.register('laptop', this.laptop.screen, { width: 1440, kind: 'desktop' });
    this.screens.register('phone', this.phone.screen, { width: 620, kind: 'phone' });
    this.screens.register('tablet', this.tablet.screen, { width: 1100, kind: 'desktop' });
    this.cases = [createEquipmentCase(0x1d2a3a), createEquipmentCase(0x2b3440)];
    this.cases.forEach((c) => scene.add(c));

    // ---- hero medicine boxes ----
    this.heroBoxes = {};
    const orvita = { ...PRODUCTS[0], name: 'Orvita', form: '250 mg', type: 'CAPSULES', accent: '#ff5a36', accent2: '#ffc23d', base: '#f7f8fa', solid: false, style: 0 };
    SEARCH_BOXES.forEach((b, i) => {
      const hb = new HeroMedicineBox({ product: orvita, lot: b.lot, exp: b.expiry, size: [0.1, 0.066, 0.036], arabic: 'أورفيتا' });
      hb.home = { p: new THREE.Vector3(LAYOUT.orvita.x0 + 0.055 + i * 0.106, LAYOUT.orvita.level + 0.033, SHELF_FRONT_Z - 0.03), r: new THREE.Euler(0, 0, 0) };
      // messy shelf: slightly rotated/pushed back, one lying flat
      const jitter = [[0.0, 0.08, 0.0], [0.012, -0.12, 0.02], [-0.006, 0.18, 0.0], [0.004, -0.06, 0.015], [0.0, 0.1, 0.03]][i];
      hb.messy = { p: hb.home.p.clone().add(new THREE.Vector3(jitter[0], 0, -jitter[2])), r: new THREE.Euler(0, jitter[1], 0) };
      this.heroBoxes[b.id] = hb; scene.add(hb.group);
    });
    // Actifed / بنسلين batch boxes (3 per batch) + their shelf-edge labels
    this.batchBoxes = {}; this.shelfLabels = {};
    const groups = [
      { batches: LABEL_BATCHES.filter((b) => b.medicine === 'Actifed'), span: LAYOUT.actifed, product: { ...PRODUCTS[1], name: 'Actifed', form: 'Tablets', type: 'TABLETS', accent: '#2f6fe4', accent2: '#1db9a0', base: '#f7f8fa', solid: false, style: 0 }, ar: 'أكتيفد' },
      { batches: LABEL_BATCHES.filter((b) => b.medicine !== 'Actifed'), span: LAYOUT.penicillin, product: { ...PRODUCTS[2], name: 'Penicillin', form: '500 mg', type: 'CAPSULES', accent: '#16a34a', accent2: '#ffc23d', base: '#f7f8fa', solid: false, style: 2 }, ar: 'بنسلين' },
    ];
    groups.forEach((gr) => {
      const n = gr.batches.length; const span = gr.span.x1 - gr.span.x0; const gw = span / n;
      gr.batches.forEach((batch, bi) => {
        const proto = new HeroMedicineBox({ product: gr.product, lot: batch.batch, exp: batch.expiry, size: [0.098, 0.068, 0.04], arabic: gr.ar });
        const list = [];
        for (let k = 0; k < 3; k++) {
          const mesh = k === 0 ? proto.mesh : new THREE.Mesh(proto.mesh.geometry, proto.mesh.material);
          mesh.castShadow = true; mesh.receiveShadow = true;
          const x = gr.span.x0 + gw * bi + gw / 2 + (k - 1) * 0.102;
          mesh.userData.home = new THREE.Vector3(x, gr.span.level + 0.034, SHELF_FRONT_Z - 0.035);
          mesh.userData.messy = mesh.userData.home.clone().add(new THREE.Vector3(((bi * 3 + k) % 3 - 1) * 0.008, 0, -0.02 - ((k * 7 + bi) % 3) * 0.015));
          mesh.userData.messyYaw = (((bi * 5 + k * 3) % 5) - 2) * 0.07;
          scene.add(mesh); list.push(mesh);
        }
        this.batchBoxes[batch.id] = list;
        const rail = this.pharmacy.shelves.railPoint(gr.span.x0 + gw * bi + gw / 2, gr.span.level, 1);
        const lab = appliedLabel(batch); lab.position.copy(rail).add(new THREE.Vector3(0, -0.004, 0.0015)); lab.visible = false;
        scene.add(lab); this.shelfLabels[batch.id] = lab;
        batch.railPoint = rail.clone();
        batch.boxCenter = new THREE.Vector3(gr.span.x0 + gw * bi + gw / 2, gr.span.level + 0.034, SHELF_FRONT_Z - 0.0);
      });
    });

    // label sticker currently being handled (one at a time, batch can be swapped)
    this.stickers = {};
    LABEL_BATCHES.forEach((b) => { const s = new Sticker(b); s.group.visible = false; scene.add(s.group); this.stickers[b.id] = s; });

    // paperwork props for interactions
    this.handInvoice = createSheet(0); scene.add(this.handInvoice);
    this.handInvoice2 = createSheet(2); scene.add(this.handInvoice2);
    this.agreement = new Agreement(); scene.add(this.agreement.group);
    this.pen2 = createPen(0x0b1d3a); scene.add(this.pen2);
    assets.onChange((w) => { if (w === 'logo') this.agreement.setLogo(assets.logo); });
    if (assets.logo) this.agreement.setLogo(assets.logo);

    // transformation sweep: a vertical sheet of light that travels across the pharmacy
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 8; const sg = sc.getContext('2d');
    const grd = sg.createLinearGradient(0, 0, 256, 0); grd.addColorStop(0, 'rgba(0,102,255,0)'); grd.addColorStop(0.7, 'rgba(60,150,255,0.35)'); grd.addColorStop(0.92, 'rgba(210,235,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 256, 8);
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    this.sweep = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshBasicMaterial({ map: stex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.sweep.visible = false; this.sweep.renderOrder = 5;
    this.sweepGroup = new THREE.Group(); this.sweepGroup.add(this.sweep); scene.add(this.sweepGroup);
    const sweepFloor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7.6), this.sweep.material); sweepFloor.rotation.x = -Math.PI / 2; sweepFloor.position.set(0, -1.59, 0.2); this.sweep.add(sweepFloor);
    this.sweep.position.y = 1.6; this.sweep.rotation.y = Math.PI / 2;

    this.phoneGlow = new THREE.PointLight(0xdfe9ff, 0, 1.2, 2); scene.add(this.phoneGlow);
    this.labelLog = []; // for QA: which labels are attached
    this.look = { ...LOOKS.neutral };
  }

  /** Neutral state before each scene applies its own. */
  beginFrame() {
    this.characters.forEach((c) => { c.reset(); c.state.visible = false; });
    this.pharmacy.setDoor(0);
    this.pharmacy.clock.setTime(10 * 3600 + 15 * 60);
    this.pharmacy.shelves.setOrganization(1);
    this.counter.setTidy(1);
    this.desk.setTidy(1);
    this.desk.setLamp(0);
    this.desk.pen.position.copy(this.desk.penRest.p); this.desk.pen.rotation.copy(this.desk.penRest.r); this.desk.pen.visible = true;
    this.desk.chair.position.copy(LAYOUT.chairSpot); this.desk.chair.rotation.y = Math.PI;
    this.desk.calculator.press(-1, 0); this.desk.calculator.setDisplay('0');
    this.desk.notebook.setProgress(1);
    this.monitor.group.visible = true; this.desk.keyboard.visible = true;
    this.printer.group.visible = true; this.printer.group.position.set(4.92, this.desk.deskH, -3.2); this.printer.group.rotation.set(0, -0.42, 0);
    this.printer.setFeed(0); this.printer.setStatus('idle'); this.printer.pressButton(0);
    this.setShelfLabels(LABEL_BATCHES.length);
    Object.values(this.stickers).forEach((s) => { s.group.visible = false; s.liner.visible = true; s.set({ peel: 0, liftL: 0, liftR: 0, bubbles: 0, bend: 0 }); });
    Object.values(this.heroBoxes).forEach((b) => { b.group.visible = true; b.group.position.copy(b.home.p); b.group.rotation.copy(b.home.r); });
    if (this.sceneIndex > 1 && this.heroBoxes.good) this.heroBoxes.good.group.visible = false; // sold in scene 02
    Object.values(this.batchBoxes).forEach((list) => list.forEach((m) => { m.visible = true; m.position.copy(m.userData.home); m.rotation.set(0, 0, 0); }));
    this.laptop.group.visible = false; this.phone.group.visible = false; this.tablet.group.visible = false;
    this.cases.forEach((c) => (c.visible = false));
    this.handInvoice.visible = false; this.handInvoice2.visible = false;
    this.agreement.group.visible = false; this.pen2.visible = false;
    ['monitor', 'laptop', 'phone', 'tablet'].forEach((n) => this.screens.set(n, { mode: 'off' }));
    this.lighting.setMood(MOODS.day);
    this.look = { ...LOOKS.neutral };
    this.pharmacy.exteriorShell.visible = false;
    this.sweep.visible = false; this.desk.mirror.visible = false; this.phoneGlow.intensity = 0;
    this.desk.cup.position.set(5.12, this.desk.deskH, -2.95); this.desk.cup.rotation.set(0, 0, 0);
    this.extraFade = 0; this.extraFadeColor = [0, 0, 0];
  }

  /** Messy (manual era) ⇄ organised blend for every "transformable" element. */
  setOrganization(k, sweep = null) {
    this.pharmacy.shelves.setOrganization(k, sweep);
    this.counter.setTidy(k);
    this.desk.setTidy(k);
    Object.values(this.heroBoxes).forEach((b) => { b.group.position.lerpVectors(b.messy.p, b.home.p, k); b.group.rotation.set(0, b.messy.r.y * (1 - k), 0); });
    Object.values(this.batchBoxes).forEach((list) => list.forEach((m) => { m.position.lerpVectors(m.userData.messy, m.userData.home, k); m.rotation.set(0, m.userData.messyYaw * (1 - k), 0); }));
  }

  /** Show the first n shelf labels (in LABEL_BATCHES order). */
  setShelfLabels(n) { LABEL_BATCHES.forEach((b, i) => (this.shelfLabels[b.id].visible = i < n)); }

  endFrame(time) {
    this.characters.forEach((c) => c.update(time));
  }
}
