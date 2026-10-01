// Export the engineering source of truth (structure + derived results) for the Cameo MBSE agent.
// node scripts/export-mbse-spec.mjs > tools/cameo/model-spec.json
import { specText } from '../src/engineering/spec.js';
process.stdout.write(specText());
