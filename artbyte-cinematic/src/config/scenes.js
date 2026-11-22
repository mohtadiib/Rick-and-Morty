/**
 * Master scene list.
 *
 * `start`/`duration` are synced to the supplied narration (192.2 s). Boundaries sit on the
 * natural pauses measured in the voice-over (silence-detect, -35 dB, >0.6 s):
 *   7.4  12.4  15.7  20.3  26.7  49.1  60.9  69.1  77.5  87.6  99.7  107.1
 *   123.6  135.5  157.6  169.3  180.8   (end 192.2)
 *
 * `authored` is the duration each scene's choreography was written for. When a scene is
 * retimed (here, or live in the production timeline editor) its whole choreography is
 * time-scaled, so no animation code needs to change.
 */
export const SCENES = [
  { id: 'traditional-pharmacy', file: 'Scene01_TraditionalPharmacy', label: '01 · الصيدلية التقليدية', start: 0.0, duration: 12.4, authored: 12.4 },
  { id: 'medicine-search', file: 'Scene02_MedicineSearch', label: '02 · مشكلة البحث عن الدواء', start: 12.4, duration: 36.7, authored: 36.7 },
  { id: 'accounting-nightmare', file: 'Scene03_AccountingNightmare', label: '03 · كابوس حسابات نهاية الشهر', start: 49.1, duration: 20.0, authored: 20.0 },
  { id: 'artbyte-arrival', file: 'Scene04_ArtByteArrival', label: '04 · وصول فريق ArtByte', start: 69.1, duration: 18.5, authored: 18.5 },
  { id: 'digital-transformation', file: 'Scene05_DigitalTransformation', label: '05 · التحول الرقمي', start: 87.6, duration: 19.5, authored: 19.5 },
  { id: 'batch-label-printing', file: 'Scene06_BatchLabelPrinting', label: '06 · طباعة ملصقات الدفعات', start: 107.1, duration: 28.4, authored: 28.4 },
  { id: 'financial-management', file: 'Scene07_FinancialManagement', label: '07 · التحكم المالي والمحاسبي', start: 135.5, duration: 22.1, authored: 22.1 },
  { id: 'mobile-management', file: 'Scene08_MobileManagement', label: '08 · الإدارة عن بُعد', start: 157.6, duration: 11.7, authored: 11.7 },
  { id: 'technical-support', file: 'Scene09_TechnicalSupport', label: '09 · شراكة الدعم الفني', start: 169.3, duration: 11.5, authored: 11.5 },
  { id: 'brand-reveal', file: 'Scene10_FinalBrandReveal', label: '10 · ArtByte', start: 180.8, duration: 13.4, authored: 13.4 },
];

/** Measured narration pauses (seconds) – drawn as markers in the timeline editor. */
export const NARRATION_PAUSES = [7.43, 12.4, 15.66, 20.26, 26.67, 49.12, 60.93, 69.08, 77.53, 87.63, 99.67, 107.07, 123.62, 135.5, 157.58, 169.31, 180.83];
