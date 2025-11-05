/**
 * Compatibility utilities for Node.js and Deno
 */

/**
 * Get an environment variable value, works in both Node.js and Deno
 */
export function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  if (typeof Deno !== 'undefined' && Deno.env) {
    return Deno.env.get(key);
  }
  return undefined;
}

/**
 * Get the current working directory, works in both Node.js and Deno
 */
export function getCwd(): string {
  if (typeof process !== 'undefined' && process.cwd) {
    return process.cwd();
  }
  if (typeof Deno !== 'undefined' && Deno.cwd) {
    return Deno.cwd();
  }
  return '.';
}

/**
 * Check if we're running in Deno
 */
export function isDeno(): boolean {
  return typeof Deno !== 'undefined';
}

/**
 * Check if we're running in Node.js
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && typeof process.versions !== 'undefined' && typeof process.versions.node !== 'undefined';
}

