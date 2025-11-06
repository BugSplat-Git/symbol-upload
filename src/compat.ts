import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get the directory name of the current module (ESM compatible)
 * Equivalent to __dirname in CommonJS
 */
export function getDirname(): string {
  // @ts-ignore - import.meta is valid in ESM but TypeScript CJS build complains
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Get the file name of the current module (ESM compatible)
 * Equivalent to __filename in CommonJS
 */
export function getFilename(): string {
  // @ts-ignore - import.meta is valid in ESM but TypeScript CJS build complains
  return fileURLToPath(import.meta.url);
}

