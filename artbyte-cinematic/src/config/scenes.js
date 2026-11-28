/**
 * Master scene list.
 *
 * `start`/`duration` are synced directly to the supplied narration (192.2 s speech + 2.0 s musical
 * resolve = 194.2 s total). See `src/config/narration-timing.json` for the complete timestamped
 * Arabic transcript that every scene boundary and internal cut is aligned to.
 *
 * `authored` matches `duration` (1 local second = 1 real second) so scene choreography stays
 * frame-accurate without time-scaling drift.
 */
export const SCENES = [
  { id: 'traditional-pharmacy', file: 'Scene01_TraditionalPharmacy', label: '01 · الصيدلية التقليدية', start: 0.0, duration: 12.0, authored: 12.0 },
  { id: 'medicine-search', file: 'Scene02_MedicineSearch', label: '02 · مشكلة البحث عن الدواء', start: 12.0, duration: 25.1, authored: 25.1 },
  { id: 'accounting-nightmare', file: 'Scene03_AccountingNightmare', label: '03 · كابوس الحسابات والدفاتر', start: 37.1, duration: 23.4, authored: 23.4 },
  { id: 'artbyte-arrival', file: 'Scene04_ArtByteArrival', label: '04 · وصول فريق ArtByte', start: 60.5, duration: 8.2, authored: 8.2 },
  { id: 'digital-transformation', file: 'Scene05_DigitalTransformation', label: '05 · متابعة الأدوية والدفعات والصلاحية', start: 68.7, duration: 17.1, authored: 17.1 },
  { id: 'batch-label-printing', file: 'Scene06_BatchLabelPrinting', label: '06 · طباعة ملصقات الدفعات', start: 85.8, duration: 20.7, authored: 20.7 },
  { id: 'financial-management', file: 'Scene07_FinancialManagement', label: '07 · التحكم المالي والمحاسبي', start: 106.5, duration: 28.5, authored: 28.5 },
  { id: 'mobile-management', file: 'Scene08_MobileManagement', label: '08 · الموبايل والحاسوب', start: 135.0, duration: 22.2, authored: 22.2 },
  { id: 'technical-support', file: 'Scene09_TechnicalSupport', label: '09 · شراكة الدعم الفني', start: 157.2, duration: 23.3, authored: 23.3 },
  { id: 'brand-reveal', file: 'Scene10_FinalBrandReveal', label: '10 · ArtByte', start: 180.5, duration: 13.7, authored: 13.7 },
];

/** Measured narration pauses (seconds) – drawn as markers in the timeline editor. */
export const NARRATION_PAUSES = [7.42, 12.0, 15.66, 20.26, 26.66, 37.1, 49.1, 60.5, 68.7, 77.52, 85.8, 99.68, 106.5, 123.62, 135.0, 157.2, 169.3, 180.5];
