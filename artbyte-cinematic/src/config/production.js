/**
 * Global production settings.
 * Everything that a producer may want to tweak without touching scene code lives here.
 */
export const PRODUCTION = {
  title: 'ArtByte – Pharmacy Management System',
  fps: 30, // used for frame stepping and offline rendering
  aspect: 16 / 9, // overridable with ?aspect=9:16
  // The supplied Arabic narration. Never rewritten or regenerated – only played back.
  narration: {
    src: './assets/audio/narration-ar.wav',
    volume: 1.0,
  },
  sfx: {
    enabled: true,
    volume: 0.32, // narration always stays the primary audio element
    ambience: true,
  },
  // In-story "today" – matches the dates visible in the supplied app screenshots.
  storyDate: '2026-11-22',
  pharmacyName: 'صيدلية النور',
  brand: {
    name: 'ArtByte',
    slogan: 'شريكك التقني لاستقرار أعمالك وتطويرها',
    logo: './assets/branding/artbyte-logo.webp',
    primary: '#0066ff',
    secondary: '#595959',
  },
  typography: {
    // Al-Jazeera is preferred where licensed: drop the font files into public/assets/fonts,
    // uncomment the @font-face rules in src/ui/fonts.css, then change both families below.
    family: "'Cairo', 'Segoe UI', Tahoma, sans-serif",
    canvasFamily: 'Cairo',
  },
  // Temporary sample dashboards for modules without supplied screenshots.
  // They are always stamped as PLACEHOLDER. Set to false to omit them from the cut.
  includePlaceholderScreens: true,
  // On-screen Arabic supers. Short phrases only; set to false to disable all supers.
  showSupers: true,
};
