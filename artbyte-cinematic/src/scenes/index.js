import { Scene01_TraditionalPharmacy } from './Scene01_TraditionalPharmacy.js';
import { Scene02_MedicineSearch } from './Scene02_MedicineSearch.js';
import { Scene03_AccountingNightmare } from './Scene03_AccountingNightmare.js';
import { Scene04_ArtByteArrival } from './Scene04_ArtByteArrival.js';
import { Scene05_DigitalTransformation } from './Scene05_DigitalTransformation.js';
import { Scene06_BatchLabelPrinting } from './Scene06_BatchLabelPrinting.js';
import { Scene07_FinancialManagement } from './Scene07_FinancialManagement.js';
import { Scene08_MobileManagement } from './Scene08_MobileManagement.js';
import { Scene09_TechnicalSupport } from './Scene09_TechnicalSupport.js';
import { Scene10_FinalBrandReveal } from './Scene10_FinalBrandReveal.js';

/** Scene registry – config/scenes.js refers to these by file name. */
export const REGISTRY = {
  Scene01_TraditionalPharmacy, Scene02_MedicineSearch, Scene03_AccountingNightmare, Scene04_ArtByteArrival, Scene05_DigitalTransformation,
  Scene06_BatchLabelPrinting, Scene07_FinancialManagement, Scene08_MobileManagement, Scene09_TechnicalSupport, Scene10_FinalBrandReveal,
};

export function createScenes(world, defs) {
  return defs.map((d) => {
    const Cls = REGISTRY[d.file];
    if (!Cls) throw new Error(`Unknown scene ${d.file}`);
    return new Cls(world, d);
  });
}
