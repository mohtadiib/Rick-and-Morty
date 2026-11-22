/**
 * Story data.
 *
 * ArtByte data below is copied verbatim from the supplied application screenshots
 * (batches screen for Actifed and بنسلين, captured 2026-11-22). The commercial's software
 * screens, printed labels and shelf boxes all read from here so they always agree.
 *
 * The "Orvita" boxes used in the pre-ArtByte search scene are FICTIONAL decoration.
 */
export const STORY_TODAY = new Date('2026-11-22T10:15:00');

export const LABEL_BATCHES = [
  // Actifed (screenshot: mobile-batches-actifed.jpg)
  { id: 'act-9dq8', medicine: 'Actifed', medicineAr: 'أكتيفد', batch: 'BCH-20261122-9DQ8', qty: 50, expiry: '23-11-2026', daysLeft: 1, status: 'critical', screen: 'batches-actifed', row: 'b2', button: 'b2label' },
  { id: 'act-0bdg', medicine: 'Actifed', medicineAr: 'أكتيفد', batch: 'BCH-20261122-0BDG', qty: 30, expiry: '30-11-2026', daysLeft: 8, status: 'critical', screen: 'batches-actifed', row: 'b3', button: 'b3label' },
  { id: 'act-a4ep', medicine: 'Actifed', medicineAr: 'أكتيفد', batch: 'BCH-20261122-A4EP', qty: 45, expiry: '18-01-2027', daysLeft: 57, status: 'valid', screen: 'batches-actifed', row: 'b4', button: 'b4label' },
  // بنسلين (screenshot: mobile-batches-penicillin.jpg)
  { id: 'pen-c6j9', medicine: 'بنسلين', medicineAr: 'بنسلين', batch: 'BCH-20261121-C6J9', qty: 5, expiry: '30-11-2026', daysLeft: 9, status: 'critical', screen: 'batches-penicillin', row: 'b1', button: 'b1label' },
  { id: 'pen-c9i3', medicine: 'بنسلين', medicineAr: 'بنسلين', batch: 'BCH-20261121-C9I3', qty: 36, expiry: '23-12-2026', daysLeft: 32, status: 'valid', screen: 'batches-penicillin', row: 'b3', button: 'b3label' },
];

/** Fictional product used in the "manual search" problem scene. */
export const SEARCH_BOXES = [
  { id: 'expired', name: 'Orvita', strength: '250 mg', lot: 'OV-2025-118', expiry: '09-2026', note: 'expired' },
  { id: 'near', name: 'Orvita', strength: '250 mg', lot: 'OV-2026-031', expiry: '25-11-2026', note: 'near' },
  { id: 'alt1', name: 'Orvita', strength: '250 mg', lot: 'OV-2026-077', expiry: '12-2026', note: 'other' },
  { id: 'alt2', name: 'Orvita', strength: '250 mg', lot: 'OV-2026-102', expiry: '01-2027', note: 'other' },
  { id: 'good', name: 'Orvita', strength: '250 mg', lot: 'OV-2026-145', expiry: '08-2027', note: 'good' },
];
