// ESM wrapper for compression.js (CommonJS)
// This allows the package to be imported as ESM while keeping the worker as CommonJS for SEA compatibility

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Export the CommonJS module through the ESM wrapper
export default require('./compression.js');