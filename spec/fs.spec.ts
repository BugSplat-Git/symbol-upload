import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fileExists } from '../src/fs.js';

const __filename = fileURLToPath(import.meta.url);

describe('fs', () => {
  describe('fileExists', () => {
    it('should return true if the file exists', async () => {
      const exists = await fileExists(__filename);
      expect(exists).toBe(true);
    });

    it('should return false if the file does not exist', async () => {
      const exists = await fileExists('does-not-exist.txt');
      expect(exists).toBe(false);
    });
  });
});
