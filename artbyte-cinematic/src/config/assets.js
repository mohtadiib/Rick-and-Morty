/**
 * Screen asset manifest.
 *
 * Every software screen shown in the commercial comes from this table. Each slot points to a
 * REAL screenshot of the ArtByte application. Slots with `src: null` are rendered as clearly
 * stamped PLACEHOLDER sample dashboards until a real screenshot is supplied.
 *
 * To replace a screen: drop the image into public/assets/screenshots/ and change `src`, or use
 * the "Screens" tab of the production panel (live replacement, no rebuild).
 *
 * `regions` are normalised rectangles [x0, y0, x1, y1] (0..1, relative to the screenshot)
 * used for highlight call-outs and tap animations. They describe what is visible in the real
 * screenshot – they never add functionality.
 */
const S = './assets/screenshots/';

export const SCREENS = {
  home: {
    title: 'الرئيسية', src: S + 'mobile-home.jpg', kind: 'mobile',
    regions: { modules: [0.06, 0.22, 0.94, 0.63], header: [0.3, 0.09, 0.7, 0.17] },
  },
  inventory: {
    title: 'المخازن · المنتجات', src: S + 'mobile-products.jpg', kind: 'mobile',
    regions: { actifed: [0.0, 0.357, 1.0, 0.497], actifedBadge: [0.63, 0.425, 0.8, 0.454], qty: [0.03, 0.4, 0.17, 0.455] },
  },
  'batches-actifed': {
    title: 'تفاصيل الدفعات وتواريخ الصلاحية', src: S + 'mobile-batches-actifed.jpg', kind: 'mobile',
    regions: {
      totals: [0.26, 0.226, 0.74, 0.274],
      b1: [0.03, 0.307, 0.97, 0.464],
      b2: [0.03, 0.475, 0.97, 0.631], b2label: [0.42, 0.562, 0.628, 0.614], b2badge: [0.06, 0.489, 0.33, 0.518],
      b3: [0.03, 0.642, 0.97, 0.798], b3label: [0.42, 0.729, 0.628, 0.781], b3badge: [0.06, 0.656, 0.33, 0.686],
      b4: [0.03, 0.809, 0.97, 0.965], b4label: [0.42, 0.896, 0.628, 0.948], b4badge: [0.06, 0.823, 0.29, 0.853],
    },
  },
  'batches-penicillin': {
    title: 'بنسلين · الدفعات', src: S + 'mobile-batches-penicillin.jpg', kind: 'mobile',
    regions: {
      b1: [0.03, 0.307, 0.97, 0.464], b1label: [0.42, 0.395, 0.628, 0.447],
      b2: [0.03, 0.475, 0.97, 0.631], b2label: [0.42, 0.562, 0.628, 0.614],
      b3: [0.03, 0.642, 0.97, 0.798], b3label: [0.42, 0.729, 0.628, 0.781],
      b4: [0.03, 0.809, 0.97, 0.965], b4label: [0.42, 0.896, 0.628, 0.948],
    },
  },
  'products-penicillin': { title: 'بنسلين', src: S + 'mobile-products-penicillin.jpg', kind: 'mobile', regions: { row: [0.0, 0.172, 1.0, 0.311] } },
  'stock-in': {
    title: 'إدخال وارد وجرد المخزن', src: S + 'mobile-stock-in.jpg', kind: 'mobile',
    regions: { actifed: [0.03, 0.315, 0.97, 0.508], qty: [0.66, 0.385, 0.94, 0.432], save: [0.04, 0.917, 0.96, 0.98] },
  },
  cashier: { title: 'الكاشير', src: S + 'mobile-cashier.jpg', kind: 'mobile', regions: { grid: [0.03, 0.195, 0.97, 0.99] } },
  'order-detail': {
    title: 'طلب #69380483', src: S + 'mobile-order-detail.jpg', kind: 'mobile',
    regions: { total: [0.03, 0.135, 0.97, 0.245], items: [0.0, 0.425, 1.0, 0.57] },
  },
  'sales-report': {
    title: 'تقارير المبيعات', src: S + 'mobile-sales-report.jpg', kind: 'mobile',
    regions: { total: [0.51, 0.135, 0.968, 0.213], invoices: [0.031, 0.135, 0.489, 0.213], kpis: [0.031, 0.135, 0.968, 0.395], list: [0.03, 0.735, 0.97, 0.9] },
  },
  'journal-entries': {
    title: 'القيود اليومية', src: S + 'mobile-journal-entries.jpg', kind: 'mobile',
    regions: { entry: [0.025, 0.268, 0.975, 0.576], cash: [0.025, 0.298, 0.975, 0.348] },
  },
  'chart-of-accounts': {
    title: 'شجرة الحسابات', src: S + 'mobile-chart-of-accounts.jpg', kind: 'mobile',
    regions: { cash: [0.025, 0.354, 0.875, 0.414], bank: [0.025, 0.422, 0.875, 0.481], receivables: [0.025, 0.489, 0.875, 0.553], inventory: [0.025, 0.561, 0.875, 0.62], assets: [0.025, 0.208, 0.975, 0.273] },
  },
  // ---- No screenshot supplied yet → stamped PLACEHOLDER sample dashboards ----
  customers: { title: 'العملاء', src: null, kind: 'placeholder', placeholder: { heading: 'إدارة العملاء', rows: ['عميل نقدي', 'عميل آجل ١', 'عميل آجل ٢', 'عميل آجل ٣'], accent: '#1db9a0' } },
  suppliers: { title: 'الموردون', src: null, kind: 'placeholder', placeholder: { heading: 'إدارة الموردين', rows: ['مورد ١', 'مورد ٢', 'مورد ٣', 'مورد ٤'], accent: '#ff7a3d' } },
  'profit-loss': { title: 'الأرباح والخسائر', src: null, kind: 'placeholder', placeholder: { heading: 'تقرير الأرباح', rows: ['إيرادات', 'تكلفة المبيعات', 'المصروفات', 'صافي الربح'], accent: '#7a5cff' } },
};

export const BRAND_ASSETS = {
  logo: './assets/branding/artbyte-logo.webp',
};

/**
 * Optional external models. When a path is set and the file exists, AssetManager loads it with
 * GLTFLoader (lazy) and the environment uses it instead of the procedural fallback.
 * Characters are procedural (see README → "Characters") because every pose is solved
 * deterministically from the timeline (IK, gaze, hands), which keeps seeking frame-exact.
 */
export const MODELS = {
  plant: null,
  chair: null,
};
