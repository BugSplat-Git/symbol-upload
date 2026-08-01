import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { filterSymbolFilePaths } from '../src/info';
import { safeRemoveTmp, tmpDir } from '../src/tmp';

describe('info', () => {
  describe('filterSymbolFilePaths', () => {
    it('should drop directories', async () => {
      await expect(
        filterSymbolFilePaths([
          'spec/support',
          'spec/support/bugsplat.xcarchive',
          'spec/support/dir with spaces',
          'spec/support/windows.sym',
        ])
      ).resolves.toEqual(['spec/support/windows.sym']);
    });

    it('should keep dSYM bundles', async () => {
      await expect(
        filterSymbolFilePaths([
          'spec/support/bugsplat.app.dSYM',
          'spec/support/libggcurl.dylib.dSYM',
        ])
      ).resolves.toEqual([
        'spec/support/bugsplat.app.dSYM',
        'spec/support/libggcurl.dylib.dSYM',
      ]);
    });

    it('should keep files and preserve order', async () => {
      const paths = [
        'spec/support/windows.sym',
        'spec/support/bugsplat.pdb',
        'spec/support/bugsplat.elf',
      ];
      await expect(filterSymbolFilePaths(paths)).resolves.toEqual(paths);
    });

    it('should drop directories whose extension merely starts with .dsym', async () => {
      const notABundle = join(tmpDir, 'weird.dsym2');
      await mkdir(notABundle, { recursive: true });

      try {
        await expect(filterSymbolFilePaths([notABundle])).resolves.toEqual([]);
      } finally {
        await safeRemoveTmp();
      }
    });

    it('should surface stat errors instead of deferring them', async () => {
      await expect(
        filterSymbolFilePaths(['spec/support/does-not-exist.sym'])
      ).rejects.toThrow('ENOENT');
    });
  });
});
